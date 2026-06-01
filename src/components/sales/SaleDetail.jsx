import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import { format } from 'date-fns';

export default function SaleDetail({ sale, onBack }) {
  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-2" />Back to Sales</Button>
      
      <div className="bg-card rounded-xl border border-border p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{sale.invoice_number}</h2>
            <p className="text-sm text-muted-foreground">{sale.sale_date ? format(new Date(sale.sale_date), 'MMMM d, yyyy') : '—'}</p>
          </div>
          <div className="flex gap-2">
            <StatusBadge status={sale.sale_type} />
            <StatusBadge status={sale.status} />
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><span className="text-muted-foreground">Customer</span><p className="font-medium">{sale.customer_name || 'Walk-in'}</p></div>
        <div><span className="text-muted-foreground">Warehouse</span><p className="font-medium">{sale.warehouse_name}</p></div>
        <div><span className="text-muted-foreground">Paid</span><p className="font-medium">ETB {fmt(sale.paid_amount)}</p></div>
        </div>

        {/* Items Table */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Product</th>
                <th className="text-right px-4 py-2 font-semibold">Qty</th>
                <th className="text-right px-4 py-2 font-semibold">Unit Price</th>
                <th className="text-right px-4 py-2 font-semibold">Discount</th>
                <th className="text-right px-4 py-2 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {(sale.items || []).map((item, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{item.product_name}</td>
                  <td className="px-4 py-2 text-right">{item.quantity}</td>
                  <td className="px-4 py-2 text-right">ETB {fmt(item.unit_price)}</td>
                  <td className="px-4 py-2 text-right">ETB {fmt(item.discount)}</td>
                  <td className="px-4 py-2 text-right font-semibold">ETB {fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="max-w-xs ml-auto text-sm space-y-1">
          <div className="flex justify-between"><span>Subtotal</span><span>ETB {fmt(sale.subtotal)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span>-ETB {fmt(sale.discount)}</span></div>
          <div className="flex justify-between"><span>Tax</span><span>ETB {fmt(sale.tax)}</span></div>
          <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>ETB {fmt(sale.total)}</span></div>
        </div>
      </div>
    </div>
  );
}