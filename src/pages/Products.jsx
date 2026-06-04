import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Package, Layers, ChevronDown, ChevronRight } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { MainImageUpload, MultiImageUpload } from '@/components/products/ImageUpload';
import { logActivity } from '@/lib/activityLogger';

const EMPTY_PRODUCT = {
  name: '', sku: '', category_id: '', brand: '', unit: 'pcs', description: '',
  main_image_url: '', additional_images: '', status: 'active', has_variants: false,
  min_stock_level: 0, default_selling_price: 0, tax_rate: 0,
};

const EMPTY_VARIANT = {
  variant_name: '', sku: '', barcode: '', size: '', color: '', material: '',
  base_unit: 'pcs', purchase_unit: 'carton', sales_unit: 'pcs', conversion_rate: 1,
  cost_price: 0, selling_price: 0, min_stock_level: 0, status: 'active',
};

export default function Products() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [variants, setVariants] = useState([]);          // working variant list in the dialog
  const [errors, setErrors] = useState({});
  const [expanded, setExpanded] = useState({});          // expanded rows in main table

  const { data: products = [], isLoading } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list('-created_date') });
  const { data: allVariants = [] } = useQuery({ queryKey: ['variants'], queryFn: () => base44.entities.ProductVariant.list() });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => base44.entities.ProductCategory.list() });

  const activeProducts = products.filter(p => !p.archived);
  const variantsFor = (pid) => allVariants.filter(v => v.product_id === pid && !v.archived);

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      // ── Validate duplicate SKU/barcode across products + variants ──
      const allSkus = new Set();
      const allBarcodes = new Set();
      products.forEach(p => { if (p.id !== editing?.id && p.sku) allSkus.add(p.sku.toLowerCase()); });
      allVariants.forEach(v => {
        if (v.product_id !== editing?.id) {
          if (v.sku) allSkus.add(v.sku.toLowerCase());
          if (v.barcode) allBarcodes.add(v.barcode.toLowerCase());
        }
      });
      if (form.sku && allSkus.has(form.sku.toLowerCase())) throw new Error(`SKU "${form.sku}" already exists`);
      // variant uniqueness within the form + against others
      const seenSku = new Set(), seenBc = new Set();
      for (const v of variants) {
        const s = (v.sku || '').toLowerCase(), b = (v.barcode || '').toLowerCase();
        if (s) {
          if (seenSku.has(s) || allSkus.has(s)) throw new Error(`Duplicate variant SKU "${v.sku}"`);
          seenSku.add(s);
        }
        if (b) {
          if (seenBc.has(b) || allBarcodes.has(b)) throw new Error(`Duplicate barcode "${v.barcode}"`);
          seenBc.add(b);
        }
      }

      const productPayload = { ...form, has_variants: variants.length > 0 };
      let productId = editing?.id;
      if (editing) {
        await base44.entities.Product.update(editing.id, productPayload);
        await logActivity({ module: 'Product', action: 'updated', entityType: 'Product', entityId: editing.id, description: `Updated product: ${form.name}` });
      } else {
        const created = await base44.entities.Product.create(productPayload);
        productId = created.id;
        await logActivity({ module: 'Product', action: 'created', entityType: 'Product', description: `Created product: ${form.name}` });
      }

      // ── Sync variants ──
      const existing = variantsFor(productId);
      for (const v of variants) {
        const payload = { ...v, product_id: productId, conversion_rate: Number(v.conversion_rate) || 1 };
        if (v.id) {
          await base44.entities.ProductVariant.update(v.id, payload);
        } else {
          await base44.entities.ProductVariant.create(payload);
          await logActivity({ module: 'Product', action: 'variant_added', entityType: 'ProductVariant', description: `Added variant ${v.variant_name} to ${form.name}` });
        }
      }
      // archive removed variants
      const keptIds = new Set(variants.filter(v => v.id).map(v => v.id));
      for (const ex of existing) {
        if (!keptIds.has(ex.id)) {
          await base44.entities.ProductVariant.update(ex.id, { archived: true, archived_at: new Date().toISOString(), status: 'inactive' });
        }
      }
    },
    onSuccess: () => { qc.invalidateQueries(); setOpen(false); setEditing(null); setErrors({}); },
    onError: (err) => setErrors({ form: err.message }),
  });

  const softDelete = useMutation({
    mutationFn: async (p) => {
      if (!window.confirm(`Archive product "${p.name}"?\n\nIt will be hidden from active lists. History is preserved.`)) throw new Error('cancelled');
      await base44.entities.Product.update(p.id, { archived: true, archived_at: new Date().toISOString(), status: 'inactive' });
      await logActivity({ module: 'Product', action: 'archived', entityType: 'Product', entityId: p.id, description: `Archived product: ${p.name}` });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
    onError: () => {},
  });

  function openNew() {
    setEditing(null); setForm(EMPTY_PRODUCT); setVariants([]); setErrors({}); setOpen(true);
  }
  function openEdit(p) {
    setEditing(p);
    setForm({
      name: p.name, sku: p.sku || '', category_id: p.category_id || '', brand: p.brand || '',
      unit: p.unit || 'pcs', description: p.description || '', main_image_url: p.main_image_url || '',
      additional_images: p.additional_images || '', status: p.status,
      min_stock_level: p.min_stock_level || 0, default_selling_price: p.default_selling_price || 0, tax_rate: p.tax_rate || 0,
      has_variants: p.has_variants,
    });
    setVariants(variantsFor(p.id).map(v => ({ ...v })));
    setErrors({}); setOpen(true);
  }

  const addVariant = () => setVariants(vs => [...vs, { ...EMPTY_VARIANT, _tmp: Date.now() }]);
  const updateVariant = (i, k, val) => setVariants(vs => vs.map((v, idx) => idx === i ? { ...v, [k]: val } : v));
  const removeVariant = (i) => setVariants(vs => vs.filter((_, idx) => idx !== i));

  const columns = [
    { header: '', cell: row => {
      const vs = variantsFor(row.id);
      return vs.length > 0 ? (
        <button onClick={e => { e.stopPropagation(); setExpanded(x => ({ ...x, [row.id]: !x[row.id] })); }} className="text-muted-foreground">
          {expanded[row.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
      ) : null;
    }},
    { header: 'Product', accessorKey: 'name', cell: row => (
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
          {row.main_image_url ? <img src={row.main_image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-muted-foreground/40" />}
        </div>
        <div className="min-w-0">
          <span className="font-medium block truncate">{row.name}</span>
          {row.sku && <span className="text-xs font-mono text-muted-foreground">{row.sku}</span>}
        </div>
      </div>
    )},
    { header: 'Category', accessorKey: 'category_id', cell: row => categories.find(c => c.id === row.category_id)?.name || '—' },
    { header: 'Brand', accessorKey: 'brand' },
    { header: 'Variants', cell: row => {
      const n = variantsFor(row.id).length;
      return n > 0 ? <Badge variant="outline" className="gap-1"><Layers className="w-3 h-3" />{n}</Badge> : <span className="text-xs text-muted-foreground">—</span>;
    }},
    { header: 'Price (ETB)', cell: row => <span className="tabular-nums">{(row.default_selling_price || 0).toLocaleString()}</span> },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: 'Actions', cell: row => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-10 w-10" title="Edit" onClick={e => { e.stopPropagation(); openEdit(row); }}><Pencil className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:text-destructive" title="Archive" onClick={e => { e.stopPropagation(); softDelete.mutate(row); }}><Trash2 className="w-3.5 h-3.5" /></Button>
      </div>
    )},
  ];

  // Flatten products with expanded variant rows
  const tableData = [];
  activeProducts.forEach(p => {
    tableData.push(p);
    if (expanded[p.id]) {
      variantsFor(p.id).forEach(v => tableData.push({ ...v, _isVariant: true, _parent: p }));
    }
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Products" description={`${activeProducts.length} products · ${allVariants.filter(v=>!v.archived).length} variants`}
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Add Product</Button>}
      />

      {/* Custom table to support variant sub-rows */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                {['', 'Product', 'Category', 'Brand', 'Variants', 'Price (ETB)', 'Status', 'Actions'].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">Loading…</td></tr>
              ) : tableData.length === 0 ? (
                <tr><td colSpan={8}>
                  <div className="flex flex-col items-center py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4"><Package className="w-7 h-7 text-muted-foreground/40" /></div>
                    <p className="font-semibold mb-1">No products yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Add your first product to start tracking inventory.</p>
                    <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Add Product</Button>
                  </div>
                </td></tr>
              ) : tableData.map((row, i) => row._isVariant ? (
                <tr key={'v'+row.id} className="bg-muted/20">
                  <td></td>
                  <td className="px-4 py-2 pl-12">
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                      <div>
                        <span className="text-sm font-medium">{row.variant_name}</span>
                        <span className="text-xs font-mono text-muted-foreground ml-2">{row.sku}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground" colSpan={2}>
                    {[row.size, row.color, row.material].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className="px-4 py-2 text-xs">{row.barcode || '—'}</td>
                  <td className="px-4 py-2 text-sm tabular-nums">{(row.selling_price || 0).toLocaleString()}</td>
                  <td className="px-4 py-2"><StatusBadge status={row.status} /></td>
                  <td></td>
                </tr>
              ) : (
                <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                  {columns.map((col, ci) => <td key={ci} className="px-4 py-3 text-sm align-middle">{col.cell ? col.cell(row) : row[col.accessorKey]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Product dialog ── */}
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Product' : 'New Product'}</DialogTitle></DialogHeader>
          {errors.form && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{errors.form}</div>}

          <div className="space-y-5">
            {/* Basic Info */}
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Basic Information</h4>
              <MainImageUpload value={form.main_image_url} onChange={v => f('main_image_url', v)} folder="products" />
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Product Name *</Label><Input value={form.name} onChange={e => f('name', e.target.value)} required /></div>
                <div><Label>Base SKU</Label><Input value={form.sku} onChange={e => f('sku', e.target.value)} placeholder="Optional if using variants" /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Category</Label>
                  <Select value={form.category_id} onValueChange={v => f('category_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Brand</Label><Input value={form.brand} onChange={e => f('brand', e.target.value)} /></div>
                <div><Label>Base Unit</Label><Input value={form.unit} onChange={e => f('unit', e.target.value)} placeholder="pcs, bag, m²" /></div>
              </div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => f('description', e.target.value)} rows={2} /></div>
              <div>
                <Label>Additional Images</Label>
                <MultiImageUpload value={form.additional_images} onChange={v => f('additional_images', v)} folder="products" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Default Price (ETB)</Label><Input type="number" step="0.01" value={form.default_selling_price} onChange={e => f('default_selling_price', Number(e.target.value))} /></div>
                <div><Label>Min Stock</Label><Input type="number" value={form.min_stock_level} onChange={e => f('min_stock_level', Number(e.target.value))} /></div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => f('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="discontinued">Discontinued</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {/* Variants */}
            <section className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Variants <span className="text-xs normal-case font-normal">(e.g. sizes, colors)</span></h4>
                <Button type="button" variant="outline" size="sm" onClick={addVariant}><Plus className="w-3.5 h-3.5 mr-1" />Add Variant</Button>
              </div>
              {variants.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No variants. The product is sold as a single item. Add variants for sizes/colors.</p>
              ) : (
                <div className="space-y-3">
                  {variants.map((v, i) => (
                    <div key={v.id || v._tmp || i} className="border border-border rounded-xl p-3 space-y-2.5 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">Variant {i + 1}</span>
                        <button type="button" onClick={() => removeVariant(i)} className="text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div><Label className="text-xs">Variant Name *</Label><Input className="h-9" value={v.variant_name} onChange={e => updateVariant(i, 'variant_name', e.target.value)} placeholder="Size 42 / Red" /></div>
                        <div><Label className="text-xs">SKU *</Label><Input className="h-9" value={v.sku} onChange={e => updateVariant(i, 'sku', e.target.value)} /></div>
                        <div><Label className="text-xs">Barcode</Label><Input className="h-9" value={v.barcode} onChange={e => updateVariant(i, 'barcode', e.target.value)} /></div>
                        <div><Label className="text-xs">Material</Label><Input className="h-9" value={v.material} onChange={e => updateVariant(i, 'material', e.target.value)} /></div>
                        <div><Label className="text-xs">Size</Label><Input className="h-9" value={v.size} onChange={e => updateVariant(i, 'size', e.target.value)} /></div>
                        <div><Label className="text-xs">Color</Label><Input className="h-9" value={v.color} onChange={e => updateVariant(i, 'color', e.target.value)} /></div>
                        <div><Label className="text-xs">Cost Price</Label><Input className="h-9" type="number" step="0.01" value={v.cost_price} onChange={e => updateVariant(i, 'cost_price', Number(e.target.value))} /></div>
                        <div><Label className="text-xs">Selling Price</Label><Input className="h-9" type="number" step="0.01" value={v.selling_price} onChange={e => updateVariant(i, 'selling_price', Number(e.target.value))} /></div>
                      </div>
                      {/* Packaging / unit conversion */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-border/60">
                        <div><Label className="text-xs">Base Unit</Label><Input className="h-9" value={v.base_unit} onChange={e => updateVariant(i, 'base_unit', e.target.value)} placeholder="pcs" /></div>
                        <div><Label className="text-xs">Purchase Unit</Label><Input className="h-9" value={v.purchase_unit} onChange={e => updateVariant(i, 'purchase_unit', e.target.value)} placeholder="carton" /></div>
                        <div><Label className="text-xs">Conversion Rate</Label><Input className="h-9" type="number" step="0.01" value={v.conversion_rate} onChange={e => updateVariant(i, 'conversion_rate', Number(e.target.value))} /></div>
                        <div><Label className="text-xs">Min Stock</Label><Input className="h-9" type="number" value={v.min_stock_level} onChange={e => updateVariant(i, 'min_stock_level', Number(e.target.value))} /></div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">1 {v.purchase_unit || 'carton'} = {v.conversion_rate || 1} {v.base_unit || 'pcs'} (stock stored in base unit)</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending || !form.name}>
              {save.isPending ? 'Saving…' : editing ? 'Update Product' : 'Create Product'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
