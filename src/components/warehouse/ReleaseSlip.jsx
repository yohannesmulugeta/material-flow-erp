import React from 'react';
import { format } from 'date-fns';

// Printable warehouse release slip. Rendered into a hidden window for printing.
export function printReleaseSlip(release, items) {
  const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(n || 0);
  const rows = items.map(it => `
    <tr>
      <td>${it.product_name || ''}${it.variant_name ? ' — ' + it.variant_name : ''}</td>
      <td style="text-align:right">${fmt(it.quantity)}</td>
      <td>${it.unit || 'pcs'}</td>
    </tr>`).join('');

  const html = `
  <html><head><title>Release Slip ${release.invoice_number || ''}</title>
  <style>
    * { font-family: Arial, sans-serif; }
    body { padding: 32px; color: #1e293b; }
    .band { background: #2563eb; color: #fff; padding: 16px 20px; border-radius: 8px; margin-bottom: 20px; }
    .band h1 { margin: 0; font-size: 22px; }
    .band p { margin: 4px 0 0; font-size: 12px; opacity: .9; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 16px 0; font-size: 13px; }
    .grid div span { color: #64748b; display: block; font-size: 11px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    th { background: #f1f5f9; text-align: left; padding: 8px; border-bottom: 2px solid #cbd5e1; }
    td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
    .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 48px; }
    .sign div { border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 12px; color: #64748b; }
    .muted { color: #64748b; font-size: 11px; margin-top: 24px; }
  </style></head>
  <body>
    <div class="band">
      <h1>Material Flow ERP</h1>
      <p>WAREHOUSE RELEASE SLIP</p>
    </div>
    <div class="grid">
      <div><span>Invoice Number</span><strong>${release.invoice_number || '—'}</strong></div>
      <div><span>Date</span><strong>${release.release_date ? format(new Date(release.release_date), 'MMM d, yyyy') : format(new Date(), 'MMM d, yyyy')}</strong></div>
      <div><span>Customer</span><strong>${release.customer_name || '—'}</strong></div>
      <div><span>Warehouse</span><strong>${release.warehouse_name || '—'}</strong></div>
      <div><span>Released By</span><strong>${release.released_by || '________________'}</strong></div>
      <div><span>Condition of Items</span><strong>${release.item_condition || '—'}</strong></div>
    </div>
    <table>
      <thead><tr><th>Product / Variant</th><th style="text-align:right">Quantity</th><th>Unit</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${release.note ? `<p class="muted"><strong>Note:</strong> ${release.note}</p>` : ''}
    <div class="sign">
      <div>Released By (Warehouse) &nbsp; — &nbsp; Signature &amp; Date</div>
      <div>Approved By (Admin) &nbsp; — &nbsp; Signature &amp; Date</div>
    </div>
    <p class="muted">Generated ${format(new Date(), 'MMM d, yyyy h:mm a')} — Material Flow ERP</p>
  </body></html>`;

  const w = window.open('', '_blank', 'width=800,height=900');
  w.document.write(html);
  w.document.close();
  setTimeout(() => { w.print(); }, 300);
}
