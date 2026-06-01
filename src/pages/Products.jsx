import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Pencil } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { logActivity } from '@/lib/activityLogger';

const EMPTY_FORM = {
  name: '', sku: '', category_id: '', brand: '', unit: '', description: '',
  min_stock_level: 0, max_stock_level: 0, reorder_level: 0, preferred_warehouse_id: '',
  default_selling_price: 0, tax_rate: 0, status: 'active'
};

export default function Products() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [skuError, setSkuError] = useState('');

  const { data: products = [], isLoading } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list('-created_date') });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => base44.entities.ProductCategory.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.filter({ status: 'active' }) });

  const f = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const save = useMutation({
    mutationFn: async (data) => {
      // Check duplicate SKU
      const duplicate = products.find(p => p.sku === data.sku && p.id !== editing?.id);
      if (duplicate) throw new Error(`SKU "${data.sku}" already exists.`);

      if (editing) {
        await base44.entities.Product.update(editing.id, data);
        await logActivity({ module: 'Product', action: 'updated', entityType: 'Product', entityId: editing.id, description: `Updated product: ${data.name}` });
      } else {
        await base44.entities.Product.create(data);
        await logActivity({ module: 'Product', action: 'created', entityType: 'Product', description: `Created product: ${data.name}` });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); setOpen(false); setEditing(null); setSkuError(''); },
    onError: (err) => { setSkuError(err.message); }
  });

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setSkuError(''); setOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      name: p.name, sku: p.sku, category_id: p.category_id || '', brand: p.brand || '',
      unit: p.unit || '', description: p.description || '',
      min_stock_level: p.min_stock_level || 0, max_stock_level: p.max_stock_level || 0,
      reorder_level: p.reorder_level || 0, preferred_warehouse_id: p.preferred_warehouse_id || '',
      default_selling_price: p.default_selling_price || 0, tax_rate: p.tax_rate || 0, status: p.status
    });
    setSkuError('');
    setOpen(true);
  };

  const columns = [
    { header: 'Name', accessorKey: 'name', cell: row => <span className="font-medium">{row.name}</span> },
    { header: 'SKU', accessorKey: 'sku', cell: row => <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{row.sku}</span> },
    { header: 'Brand', accessorKey: 'brand' },
    { header: 'Category', cell: row => { const c = categories.find(c => c.id === row.category_id); return c?.name || '—'; } },
    { header: 'Unit', accessorKey: 'unit' },
    { header: 'Min Stock', accessorKey: 'min_stock_level' },
    { header: 'Sell Price', cell: row => row.default_selling_price ? `ETB ${row.default_selling_price.toLocaleString()}` : '—' },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: '', cell: row => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(row); }}><Pencil className="w-3.5 h-3.5" /></Button> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Products" description="Manage your product catalog" actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Add Product</Button>} />
      <DataTable columns={columns} data={products} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Product' : 'New Product'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(form); }}>
            <Tabs defaultValue="basic" className="space-y-4">
              <TabsList className="w-full">
                <TabsTrigger value="basic" className="flex-1">Basic Info</TabsTrigger>
                <TabsTrigger value="inventory" className="flex-1">Inventory</TabsTrigger>
                <TabsTrigger value="financial" className="flex-1">Financial</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Product Name *</Label>
                    <Input value={form.name} onChange={e => f('name', e.target.value)} required />
                  </div>
                  <div>
                    <Label>SKU *</Label>
                    <Input value={form.sku} onChange={e => { f('sku', e.target.value); setSkuError(''); }} required />
                    {skuError && <p className="text-xs text-destructive mt-1">{skuError}</p>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category_id} onValueChange={v => f('category_id', v)}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Brand</Label>
                    <Input value={form.brand} onChange={e => f('brand', e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>Unit</Label>
                  <Input value={form.unit} onChange={e => f('unit', e.target.value)} placeholder="pcs, kg, m, box..." />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={form.description} onChange={e => f('description', e.target.value)} rows={3} />
                </div>
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
              </TabsContent>

              <TabsContent value="inventory" className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Min Stock Level</Label>
                    <Input type="number" value={form.min_stock_level} onChange={e => f('min_stock_level', Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Max Stock Level</Label>
                    <Input type="number" value={form.max_stock_level} onChange={e => f('max_stock_level', Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Reorder Level</Label>
                    <Input type="number" value={form.reorder_level} onChange={e => f('reorder_level', Number(e.target.value))} />
                  </div>
                </div>
                <div>
                  <Label>Preferred Warehouse</Label>
                  <Select value={form.preferred_warehouse_id} onValueChange={v => f('preferred_warehouse_id', v)}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={null}>None</SelectItem>
                      {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </TabsContent>

              <TabsContent value="financial" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Default Selling Price (ETB)</Label>
                    <Input type="number" step="0.01" value={form.default_selling_price} onChange={e => f('default_selling_price', Number(e.target.value))} />
                  </div>
                  <div>
                    <Label>Tax Rate (%)</Label>
                    <Input type="number" step="0.01" min="0" max="100" value={form.tax_rate} onChange={e => f('tax_rate', Number(e.target.value))} />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <Button type="submit" className="w-full mt-4" disabled={save.isPending}>
              {save.isPending ? 'Saving...' : editing ? 'Update Product' : 'Create Product'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}