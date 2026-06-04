import React, { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import StatusBadge from '@/components/ui/StatusBadge';
import AuditTrail from '@/components/ui/AuditTrail';
import PageHeader from '@/components/ui/PageHeader';
import {
  ArrowLeft, Package, TrendingUp, TrendingDown, AlertTriangle, ShoppingCart,
  ArrowLeftRight, Undo2, SlidersHorizontal, Clock,
} from 'lucide-react';
import { format } from 'date-fns';

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const fmtQty = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n || 0);

export default function InventoryDetail() {
  const { productId, variantId } = useParams();
  const navigate = useNavigate();

  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: variants = [] } = useQuery({ queryKey: ['variants'], queryFn: () => base44.entities.ProductVariant.list() });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => base44.entities.ProductCategory.list() });
  const { data: transactions = [] } = useQuery({
    queryKey: ['tx-product', productId],
    queryFn: () => base44.entities.StockTransaction.filter({ product_id: productId }, '-created_date', 100),
    enabled: !!productId,
  });

  const product = products.find(p => p.id === productId);
  const variant = variantId ? variants.find(v => v.id === variantId) : null;
  const category = categories.find(c => c.id === product?.category_id);

  const invRows = useMemo(() =>
    inventory.filter(i => i.product_id === productId && (variantId ? i.variant_id === variantId : !i.variant_id)),
    [inventory, productId, variantId]);

  const totalStock = invRows.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalReserved = invRows.reduce((s, i) => s + (i.reserved_quantity || 0), 0);
  const available = totalStock - totalReserved;
  const totalValue = invRows.reduce((s, i) => s + (i.total_value_etb || 0), 0);
  const avgCost = totalStock > 0 ? totalValue / totalStock : 0;
  const latestLanded = invRows.map(i => i.latest_landed_cost_etb).filter(Boolean).pop() || avgCost;
  const minLevel = variant?.min_stock_level || product?.min_stock_level || 0;
  const sellingPrice = variant?.selling_price || product?.default_selling_price || 0;
  const isLow = available <= minLevel;

  // categorize transactions
  const txByReason = (reasons) => transactions.filter(t => reasons.includes(t.reason)).slice(0, 5);
  const recentSales = txByReason(['sale']);
  const recentTransfers = transactions.filter(t => ['transfer_in', 'transfer_out'].includes(t.reason)).slice(0, 5);
  const recentReturns = txByReason(['return']);
  const recentDamage = transactions.filter(t => ['damage', 'loss'].includes(t.reason)).slice(0, 5);
  const recentAdjust = txByReason(['adjustment']);

  if (!product) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/inventory')}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
        <p className="text-muted-foreground">Product not found.</p>
      </div>
    );
  }

  const card = (label, value, color = '') => (
    <div className="bg-card border border-border rounded-xl p-3 text-center">
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
    </div>
  );

  const txList = (title, icon, items, signFn) => (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
        {icon}<h4 className="text-sm font-semibold">{title}</h4>
        <Badge variant="outline" className="ml-auto text-[10px]">{items.length}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">None</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {items.map(t => (
            <li key={t.id} className="px-3 py-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t.warehouse_name || '—'}</span>
              <div className="text-right">
                <span className={`font-semibold tabular-nums ${signFn(t) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {signFn(t) >= 0 ? '+' : ''}{fmtQty(t.quantity)}
                </span>
                <p className="text-[11px] text-muted-foreground">{t.created_at ? format(new Date(t.created_at), 'MMM d, h:mm a') : ''}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  let extraImages = [];
  try { extraImages = product.additional_images ? JSON.parse(product.additional_images) : []; } catch {}

  return (
    <div className="space-y-5">
      <Button variant="ghost" onClick={() => navigate('/inventory')}><ArrowLeft className="w-4 h-4 mr-2" />Back to Inventory</Button>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className="w-28 h-28 rounded-2xl bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center border border-border">
          {product.main_image_url ? <img src={product.main_image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-10 h-10 text-muted-foreground/40" />}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{product.name}{variant && <span className="text-muted-foreground"> — {variant.variant_name}</span>}</h1>
          <div className="flex flex-wrap gap-2 mt-2 text-sm">
            {(variant?.sku || product.sku) && <Badge variant="outline" className="font-mono">{variant?.sku || product.sku}</Badge>}
            {variant?.barcode && <Badge variant="outline">Barcode: {variant.barcode}</Badge>}
            {category && <Badge variant="outline">{category.name}</Badge>}
            {product.brand && <Badge variant="outline">{product.brand}</Badge>}
            <StatusBadge status={variant?.status || product.status} />
            {isLow && <Badge variant="outline" className="border-amber-300 text-amber-600 gap-1"><AlertTriangle className="w-3 h-3" />Low Stock</Badge>}
          </div>
          {extraImages.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {extraImages.slice(0, 6).map((u, i) => <img key={i} src={u} alt="" className="w-10 h-10 rounded-lg object-cover border border-border" />)}
            </div>
          )}
        </div>
      </div>

      {/* Stock + financial cards */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
        {card('Total Stock', fmtQty(totalStock))}
        {card('Reserved', fmtQty(totalReserved), 'text-amber-600')}
        {card('Available', fmtQty(available), available < 0 ? 'text-red-600' : 'text-emerald-600')}
        {card('Avg Cost', fmt(avgCost))}
        {card('Latest Landed', fmt(latestLanded))}
        {card('Sell Price', fmt(sellingPrice), 'text-primary')}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {card('Inventory Value (ETB)', fmt(totalValue), 'text-primary')}
        {card('Min Stock Level', fmtQty(minLevel))}
        {card('Low Stock?', isLow ? 'YES' : 'No', isLow ? 'text-amber-600' : 'text-emerald-600')}
      </div>

      {/* Stock by warehouse */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/40"><h3 className="font-semibold text-sm">Stock by Warehouse</h3></div>
        {invRows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No stock recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/20"><tr>
              {['Warehouse', 'Total', 'Reserved', 'Available', 'Avg Cost', 'Value'].map(h => <th key={h} className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border/50">
              {invRows.map(r => {
                const av = (r.quantity || 0) - (r.reserved_quantity || 0);
                return (
                  <tr key={r.id}>
                    <td className="px-4 py-2 font-medium">{r.warehouse_name}</td>
                    <td className="px-4 py-2 tabular-nums">{fmtQty(r.quantity)}</td>
                    <td className="px-4 py-2 tabular-nums text-amber-600">{fmtQty(r.reserved_quantity)}</td>
                    <td className="px-4 py-2 tabular-nums font-semibold text-emerald-600">{fmtQty(av)}</td>
                    <td className="px-4 py-2 tabular-nums">{fmt(r.avg_cost_etb)}</td>
                    <td className="px-4 py-2 tabular-nums font-medium">{fmt(r.total_value_etb)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Activity grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {txList('Recent Sales', <ShoppingCart className="w-4 h-4 text-red-500" />, recentSales, () => -1)}
        {txList('Recent Transfers', <ArrowLeftRight className="w-4 h-4 text-blue-500" />, recentTransfers, t => t.type === 'stock_in' ? 1 : -1)}
        {txList('Recent Returns', <Undo2 className="w-4 h-4 text-emerald-500" />, recentReturns, () => 1)}
        {txList('Recent Damage / Loss', <AlertTriangle className="w-4 h-4 text-orange-500" />, recentDamage, () => -1)}
        {txList('Recent Adjustments', <SlidersHorizontal className="w-4 h-4 text-purple-500" />, recentAdjust, t => t.type === 'stock_in' ? 1 : -1)}
      </div>

      {/* Full timeline */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/40 flex items-center gap-2"><Clock className="w-4 h-4" /><h3 className="font-semibold text-sm">Full Inventory Timeline</h3></div>
        {transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No movements recorded.</p>
        ) : (
          <ul className="divide-y divide-border/50 max-h-96 overflow-y-auto">
            {transactions.map(t => (
              <li key={t.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                {t.type === 'stock_in' ? <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0" />}
                <span className={`font-semibold tabular-nums w-16 ${t.type === 'stock_in' ? 'text-emerald-600' : 'text-red-500'}`}>{t.type === 'stock_in' ? '+' : '-'}{fmtQty(t.quantity)}</span>
                <span className="capitalize flex-1">{(t.reason || '').replace(/_/g, ' ')}</span>
                <span className="text-muted-foreground">{t.warehouse_name}</span>
                <span className="text-xs text-muted-foreground w-32 text-right">{t.created_at ? format(new Date(t.created_at), 'MMM d, yyyy h:mm a') : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AuditTrail record={variant || product} />
    </div>
  );
}
