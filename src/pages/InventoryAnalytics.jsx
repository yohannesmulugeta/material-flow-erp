import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ui/PageHeader';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line,
} from 'recharts';
import { TrendingUp, TrendingDown, AlertTriangle, Package, DollarSign } from 'lucide-react';
import { format, subDays, differenceInDays } from 'date-fns';

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
const fmtQty = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n || 0);
const BRAND = ['hsl(224,76%,48%)', 'hsl(160,60%,45%)', 'hsl(30,80%,55%)', 'hsl(280,65%,60%)', 'hsl(340,75%,55%)'];

export default function InventoryAnalytics() {
  const [days, setDays] = useState('90');
  const [warehouse, setWarehouse] = useState('all');
  const [category, setCategory] = useState('all');

  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => base44.entities.ProductCategory.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.list() });
  const { data: transactions = [] } = useQuery({ queryKey: ['stock-tx-all'], queryFn: () => base44.entities.StockTransaction.list('-created_date', 1000) });
  const { data: sales = [] } = useQuery({ queryKey: ['sales'], queryFn: () => base44.entities.Sale.list('-created_date', 500) });

  const cutoff = subDays(new Date(), Number(days)).toISOString();

  const analytics = useMemo(() => {
    // filter inventory
    let inv = inventory;
    if (warehouse !== 'all') inv = inv.filter(i => i.warehouse_id === warehouse);
    if (category !== 'all') {
      const catProductIds = new Set(products.filter(p => p.category_id === category).map(p => p.id));
      inv = inv.filter(i => catProductIds.has(i.product_id));
    }

    // aggregate per product
    const byProduct = {};
    inv.forEach(i => {
      if (!byProduct[i.product_id]) {
        const prod = products.find(p => p.id === i.product_id);
        byProduct[i.product_id] = { product_id: i.product_id, name: i.product_name, product: prod, qty: 0, value: 0, soldQty: 0, revenue: 0, cost: 0, lastMove: null, avgCost: i.avg_cost_etb || 0, landed: i.latest_landed_cost_etb || i.avg_cost_etb || 0, sellPrice: prod?.default_selling_price || 0 };
      }
      byProduct[i.product_id].qty += i.quantity || 0;
      byProduct[i.product_id].value += i.total_value_etb || 0;
    });

    // sales movement in period
    sales.filter(s => s.status === 'completed' && (s.created_at || '') >= cutoff).forEach(s => {
      let items = [];
      try { items = typeof s.items === 'string' ? JSON.parse(s.items) : (s.items || []); } catch {}
      items.forEach(it => {
        const rec = byProduct[it.product_id];
        if (rec) { rec.soldQty += it.quantity || 0; rec.revenue += it.total || 0; rec.cost += (it.unit_cost || 0) * (it.quantity || 0); }
      });
    });

    // last movement date per product
    transactions.forEach(t => {
      const rec = byProduct[t.product_id];
      if (rec && t.created_at && (!rec.lastMove || t.created_at > rec.lastMove)) rec.lastMove = t.created_at;
    });

    const list = Object.values(byProduct);
    const monthlySales = (r) => r.soldQty / (Number(days) / 30);

    return {
      totalValue: list.reduce((s, r) => s + r.value, 0),
      list,
      fastMoving: [...list].filter(r => r.soldQty > 0).sort((a, b) => b.soldQty - a.soldQty).slice(0, 8),
      slowMoving: [...list].filter(r => r.qty > 0 && r.soldQty >= 0).sort((a, b) => a.soldQty - b.soldQty).slice(0, 8),
      deadStock: list.filter(r => r.qty > 0 && (!r.lastMove || differenceInDays(new Date(), new Date(r.lastMove)) >= 90)),
      lowStock: list.filter(r => r.qty <= (r.product?.min_stock_level || 0) && r.product?.status === 'active'),
      overstock: list.filter(r => { const ms = monthlySales(r); return ms > 0 && r.qty > ms * 3; }),
      profitable: [...list].filter(r => r.revenue > 0).map(r => ({ ...r, profit: r.revenue - r.cost })).sort((a, b) => b.profit - a.profit).slice(0, 8),
      lossMaking: list.filter(r => r.sellPrice > 0 && r.landed > 0 && r.sellPrice < r.landed),
      byWarehouse: warehouses.map(w => ({ name: w.name, value: inventory.filter(i => i.warehouse_id === w.id).reduce((s, i) => s + (i.total_value_etb || 0), 0) })).filter(x => x.value > 0),
    };
  }, [inventory, products, categories, warehouses, transactions, sales, cutoff, days, warehouse, category]);

  // movement trend (last N days net qty)
  const trend = useMemo(() => {
    return Array.from({ length: 14 }, (_, idx) => {
      const d = subDays(new Date(), 13 - idx);
      const dateStr = format(d, 'yyyy-MM-dd');
      const dayTx = transactions.filter(t => (t.created_at || '').slice(0, 10) === dateStr);
      return {
        date: format(d, 'MMM d'),
        in: dayTx.filter(t => t.type === 'stock_in').reduce((s, t) => s + (t.quantity || 0), 0),
        out: dayTx.filter(t => t.type === 'stock_out').reduce((s, t) => s + (t.quantity || 0), 0),
      };
    });
  }, [transactions]);

  const kpi = (label, value, icon, color) => (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className={`p-1.5 rounded-lg ${color}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold tabular-nums mt-1">{value}</p>
    </div>
  );

  const list = (title, items, render, icon) => (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center gap-2">{icon}<h3 className="font-semibold text-sm">{title}</h3><Badge variant="outline" className="ml-auto text-[10px]">{items.length}</Badge></div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">None</p> : (
        <ul className="divide-y divide-border/50 max-h-72 overflow-y-auto">{items.map((r, i) => <li key={i} className="px-4 py-2.5 flex items-center justify-between text-sm">{render(r)}</li>)}</ul>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="Inventory Analytics" description="Stock movement, profitability, and aging insights" />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{[['30','Last 30 days'],['90','Last 90 days'],['180','Last 6 months'],['365','Last year']].map(([v,l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={warehouse} onValueChange={setWarehouse}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Warehouse" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Warehouses</SelectItem>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Categories</SelectItem>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpi('Total Inventory Value', `ETB ${fmt(analytics.totalValue)}`, <DollarSign className="w-4 h-4 text-primary" />, 'bg-primary/10')}
        {kpi('Low Stock Items', analytics.lowStock.length, <AlertTriangle className="w-4 h-4 text-amber-600" />, 'bg-amber-500/10')}
        {kpi('Dead Stock Items', analytics.deadStock.length, <Package className="w-4 h-4 text-red-600" />, 'bg-red-500/10')}
        {kpi('Loss-Making Items', analytics.lossMaking.length, <TrendingDown className="w-4 h-4 text-red-600" />, 'bg-red-500/10')}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="font-semibold text-sm mb-3">Stock Movement Trend (14 days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="in" name="Stock In" stroke={BRAND[1]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="out" name="Stock Out" stroke={BRAND[4]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <h3 className="font-semibold text-sm mb-3">Stock Value by Warehouse</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={analytics.byWarehouse} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={v => `ETB ${fmt(v)}`} />
              <Bar dataKey="value" radius={[4,4,0,0]}>{analytics.byWarehouse.map((_, i) => <Cell key={i} fill={BRAND[i % BRAND.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {list('Fast Moving', analytics.fastMoving, r => (<><span className="font-medium truncate">{r.name}</span><span className="tabular-nums text-emerald-600 font-semibold">{fmtQty(r.soldQty)} sold</span></>), <TrendingUp className="w-4 h-4 text-emerald-500" />)}
        {list('Slow Moving', analytics.slowMoving, r => (<><span className="font-medium truncate">{r.name}</span><span className="tabular-nums text-muted-foreground">{fmtQty(r.soldQty)} sold</span></>), <TrendingDown className="w-4 h-4 text-amber-500" />)}
        {list('Most Profitable', analytics.profitable, r => (<><span className="font-medium truncate">{r.name}</span><span className="tabular-nums text-emerald-600 font-semibold">ETB {fmt(r.profit)}</span></>), <DollarSign className="w-4 h-4 text-emerald-500" />)}
        {list('Loss-Making (sell &lt; landed cost)', analytics.lossMaking, r => (<><span className="font-medium truncate">{r.name}</span><span className="tabular-nums text-red-600">sell {fmt(r.sellPrice)} / cost {fmt(r.landed)}</span></>), <TrendingDown className="w-4 h-4 text-red-500" />)}
        {list('Dead Stock (90+ days no movement)', analytics.deadStock, r => (<><span className="font-medium truncate">{r.name}</span><span className="tabular-nums text-muted-foreground">{fmtQty(r.qty)} units · {r.lastMove ? `${differenceInDays(new Date(), new Date(r.lastMove))}d` : 'never'}</span></>), <Package className="w-4 h-4 text-red-500" />)}
        {list('Overstock (3×+ monthly sales)', analytics.overstock, r => (<><span className="font-medium truncate">{r.name}</span><span className="tabular-nums text-amber-600">{fmtQty(r.qty)} units</span></>), <AlertTriangle className="w-4 h-4 text-amber-500" />)}
        {list('Low Stock', analytics.lowStock, r => (<><span className="font-medium truncate">{r.name}</span><span className="tabular-nums text-amber-600">{fmtQty(r.qty)} / min {fmtQty(r.product?.min_stock_level || 0)}</span></>), <AlertTriangle className="w-4 h-4 text-amber-500" />)}
      </div>
    </div>
  );
}
