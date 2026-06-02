import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import AuditTrail from '@/components/ui/AuditTrail';
import { format } from 'date-fns';

export default function SaleDetail({ sale, onBack, canSeeProfit = false }) {
  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  // items is stored as JSON string in DB
  let items = [];
  try {
    items = typeof sale.items === 'string' ? JSON.parse(sale.items) : (sale.items || []);
  } catch {
    items = [];
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-2" />Back to Sales</Button>

      <div className="bg-card rounded-xl border border-border p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold font-mono">{sale.invoice_number}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {sale.sale_date ? format(new Date(sale.sale_date), 'MMMM d, yyyy') : '—'}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <StatusBadge status={sale.sale_type} />
            <StatusBadge status={sale.status} />
          </div>
        </div>

        {/* Meta info */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm bg-muted/30 rounded-lg p-4">
          <div><p className="text-muted-foreground text-xs mb-0.5">Customer</p><p className="font-medium">{sale.customer_name || 'Walk-in'}</p></div>
          <div><p className="text-muted-foreground text-xs mb-0.5">Warehouse</p><p className="font-medium">{sale.warehouse_name || '—'}</p></div>
          <div><p className="text-muted-foreground text-xs mb-0.5">Paid Amount</p><p className="font-semibold">ETB {fmt(sale.paid_amount)}</p></div>
        </div>

        {/* Items */}
        <div>
          <h3 className="text-sm font-semibold mb-2">Items</h3>
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-semibold">Product</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Qty</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Unit Price</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground text-sm">No items</td></tr>
                  ) : items.map((item, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-4 py-2.5 font-medium">{item.product_name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{item.quantity}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">ETB {fmt(item.unit_price)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">ETB {fmt(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="max-w-xs ml-auto text-sm space-y-1.5">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">ETB {fmt(sale.subtotal)}</span></div>
          {(sale.discount || 0) > 0 && (
            <div className="flex justify-between text-red-500"><span>Discount</span><span className="tabular-nums">-ETB {fmt(sale.discount)}</span></div>
          )}
          {(sale.tax || 0) > 0 && (
            <div className="flex justify-between"><span>Tax</span><span className="tabular-nums">ETB {fmt(sale.tax)}</span></div>
          )}
          <div className="flex justify-between font-bold text-base border-t border-border pt-2">
            <span>Total</span><span className="tabular-nums">ETB {fmt(sale.total)}</span>
          </div>
          {canSeeProfit && (
            <div className="flex justify-between text-emerald-600 text-xs pt-1">
              <span>Gross Profit</span><span className="tabular-nums">ETB {fmt(sale.total_profit)}</span>
            </div>
          )}
        </div>

        {sale.notes && (
          <div className="text-sm bg-muted/30 rounded-lg p-3">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p>{sale.notes}</p>
          </div>
        )}

        <AuditTrail record={sale} />
      </div>
    </div>
  );
}
