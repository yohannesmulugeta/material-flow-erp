import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import StatusBadge from '@/components/ui/StatusBadge';
import { Package, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

export default function ProductStockDetail({ product, inventoryRows, categories, open, onClose }) {
  const { data: transactions = [] } = useQuery({
    queryKey: ['stock-tx-product', product?.id],
    queryFn: () => base44.entities.StockTransaction.filter({ product_id: product?.id }, '-created_date', 20),
    enabled: !!product?.id
  });

  if (!product) return null;

  const category = categories?.find(c => c.id === product.category_id);
  const totalStock = inventoryRows.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalValue = inventoryRows.reduce((s, i) => s + (i.total_value_etb || 0), 0);
  const avgCost = inventoryRows.length > 0 ? inventoryRows.reduce((s, i) => s + (i.avg_cost_etb || 0), 0) / inventoryRows.length : 0;
  const isLowStock = totalStock <= (product.min_stock_level || 0);
  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" />
            {product.name}
          </SheetTitle>
        </SheetHeader>

        {/* Product Summary */}
        <div className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">SKU</span><span className="font-mono font-medium">{product.sku}</span></div>
            {product.brand && <div className="flex justify-between"><span className="text-muted-foreground">Brand</span><span>{product.brand}</span></div>}
            {category && <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span>{category.name}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Unit</span><span>{product.unit || '—'}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Status</span><StatusBadge status={product.status} /></div>
          </div>

          {/* Alerts */}
          {isLowStock && (
            <div className="flex items-center gap-2 bg-amber-500/10 text-amber-700 rounded-lg p-3 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>Low stock! Current: {totalStock} / Min: {product.min_stock_level}</span>
            </div>
          )}

          {/* Stock Summary */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Stock Information</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-card border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">{totalStock}</p>
                <p className="text-xs text-muted-foreground">Total Stock</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 text-center">
                <p className="text-2xl font-bold">ETB {fmt(avgCost)}</p>
                <p className="text-xs text-muted-foreground">Avg Cost/Unit</p>
              </div>
              <div className="bg-card border border-border rounded-lg p-3 text-center col-span-2">
                <p className="text-2xl font-bold text-primary">ETB {fmt(totalValue)}</p>
                <p className="text-xs text-muted-foreground">Total Inventory Value</p>
              </div>
            </div>
          </div>

          {/* Per Warehouse */}
          {inventoryRows.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-2">Stock per Warehouse</h4>
              <div className="space-y-2">
                {inventoryRows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between bg-muted/30 rounded-lg p-2.5 text-sm">
                    <span className="font-medium">{row.warehouse_name}</span>
                    <div className="text-right">
                      <span className="font-bold">{row.quantity}</span>
                      <span className="text-xs text-muted-foreground ml-1">{product.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Financial</h4>
            <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Default Sell Price</span><span>ETB {fmt(product.default_selling_price)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax Rate</span><span>{product.tax_rate || 0}%</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Min Stock</span><span>{product.min_stock_level}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Reorder Level</span><span>{product.reorder_level || 0}</span></div>
            </div>
          </div>

          {/* Recent Activity */}
          <div>
            <h4 className="text-sm font-semibold mb-2">Recent Activity</h4>
            {transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No recent transactions</p>
            ) : (
              <div className="space-y-2">
                {transactions.slice(0, 10).map(tx => (
                  <div key={tx.id} className="flex items-center gap-2 text-sm border-b border-border pb-2 last:border-0">
                    {tx.type === 'stock_in'
                      ? <TrendingUp className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      : <TrendingDown className="w-4 h-4 text-red-500 flex-shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <span className={`font-medium ${tx.type === 'stock_in' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {tx.type === 'stock_in' ? '+' : '-'}{tx.quantity}
                      </span>
                      <span className="text-muted-foreground ml-1 capitalize">{(tx.reason || '').replace(/_/g, ' ')}</span>
                      <p className="text-xs text-muted-foreground">{tx.warehouse_name} · {format(new Date(tx.created_date), 'MMM d, h:mm a')}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}