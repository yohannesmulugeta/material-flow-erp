import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ui/PageHeader';
import { Package, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const fmtQty = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n || 0);

export default function Inventory() {
  const navigate = useNavigate();
  const [warehouseFilter, setWarehouseFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data: inventory = [], isLoading } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.list() });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => base44.entities.ProductCategory.list() });

  const rows = useMemo(() => {
    let base;
    if (warehouseFilter === 'all') {
      // aggregate per product+variant across warehouses
      const map = {};
      inventory.forEach(i => {
        const key = `${i.product_id}__${i.variant_id || 'base'}`;
        if (!map[key]) map[key] = { ...i, warehouse_name: 'All Warehouses', quantity: 0, reserved_quantity: 0, total_value_etb: 0 };
        map[key].quantity += i.quantity || 0;
        map[key].reserved_quantity += i.reserved_quantity || 0;
        map[key].total_value_etb += i.total_value_etb || 0;
      });
      base = Object.values(map);
    } else if (warehouseFilter === 'per_warehouse') {
      base = inventory;
    } else {
      base = inventory.filter(i => i.warehouse_id === warehouseFilter);
    }
    return base.map(r => {
      const prod = products.find(p => p.id === r.product_id);
      const cat = categories.find(c => c.id === prod?.category_id);
      const available = (r.quantity || 0) - (r.reserved_quantity || 0);
      const minLevel = prod?.min_stock_level || 0;
      return { ...r, product: prod, category_name: cat?.name || '—', available, is_low: available <= minLevel, is_negative: available < 0 };
    }).filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (r.product_name || '').toLowerCase().includes(q) || (r.variant_name || '').toLowerCase().includes(q) || (r.product?.sku || '').toLowerCase().includes(q);
    });
  }, [inventory, products, categories, warehouseFilter, search]);

  const totalValue = rows.reduce((s, x) => s + (x.total_value_etb || 0), 0);
  const totalQty = rows.reduce((s, x) => s + (x.quantity || 0), 0);
  const totalReserved = rows.reduce((s, x) => s + (x.reserved_quantity || 0), 0);
  const lowCount = rows.filter(x => x.is_low).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Inventory"
        description={`${fmtQty(totalQty)} units · ${fmtQty(totalReserved)} reserved · ETB ${fmt(totalValue)}${lowCount ? ` · ${lowCount} low` : ''}`}
        actions={
          <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Combined (All)</SelectItem>
              <SelectItem value="per_warehouse">Per Warehouse</SelectItem>
              {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Stock Value', value: `ETB ${fmt(totalValue)}`, color: 'text-primary' },
          { label: 'Total Units', value: fmtQty(totalQty), color: '' },
          { label: 'Reserved', value: fmtQty(totalReserved), color: 'text-amber-600' },
          { label: 'Available', value: fmtQty(totalQty - totalReserved), color: 'text-emerald-600' },
        ].map(c => (
          <div key={c.label} className="bg-card border border-border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search product, variant, SKU…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-muted/40 border-b border-border">
              <tr>
                {['Product / Variant', 'Category', 'Warehouse', 'Total', 'Reserved', 'Available', 'Value (ETB)'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7}>
                  <div className="flex flex-col items-center py-16 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4"><Package className="w-7 h-7 text-muted-foreground/40" /></div>
                    <p className="font-semibold mb-1">No inventory records</p>
                    <p className="text-sm text-muted-foreground">Stock appears here after receiving containers or stock-in.</p>
                  </div>
                </td></tr>
              ) : rows.map((r, i) => (
                <tr key={i} className="hover:bg-primary/5 transition-colors cursor-pointer"
                  onClick={() => navigate(`/inventory/${r.product_id}${r.variant_id ? '/' + r.variant_id : ''}`)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {r.product?.main_image_url ? <img src={r.product.main_image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-4 h-4 text-muted-foreground/40" />}
                      </div>
                      <div className="min-w-0">
                        <span className="font-medium block truncate">{r.product_name}</span>
                        {r.variant_name && <span className="text-xs text-muted-foreground">{r.variant_name}</span>}
                        {r.product?.sku && !r.variant_name && <span className="text-xs font-mono text-muted-foreground">{r.product.sku}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm">{r.category_name}</td>
                  <td className="px-4 py-3 text-sm">{r.warehouse_name}</td>
                  <td className="px-4 py-3 text-sm tabular-nums font-medium">{fmtQty(r.quantity)}</td>
                  <td className="px-4 py-3 text-sm tabular-nums text-amber-600">{fmtQty(r.reserved_quantity)}</td>
                  <td className="px-4 py-3 text-sm tabular-nums">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-semibold ${r.is_negative ? 'text-red-600' : r.is_low ? 'text-amber-600' : 'text-emerald-600'}`}>{fmtQty(r.available)}</span>
                      {r.is_low && !r.is_negative && <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-300 text-amber-600">LOW</Badge>}
                      {r.is_negative && <Badge variant="destructive" className="text-[10px] px-1 py-0">NEG</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm tabular-nums font-medium">{fmt(r.total_value_etb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
