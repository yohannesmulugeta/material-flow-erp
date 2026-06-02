import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowLeft, FileText } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import AuditTrail from '@/components/ui/AuditTrail';
import { exportReportPDF, exportReportXLSX } from '@/lib/reportEngine';
import { format } from 'date-fns';

export default function SupplierStatement({ supplier, onBack }) {
  const { data: containers = [] } = useQuery({
    queryKey: ['supplier-containers', supplier.id],
    queryFn: () => base44.entities.Container.filter({ supplier_id: supplier.id }, '-created_date'),
  });
  const { data: payments = [] } = useQuery({
    queryKey: ['supplier-payments', supplier.id],
    queryFn: () => base44.entities.Payment.filter({ reference_id: supplier.id, type: 'supplier_payment' }, '-created_date'),
  });

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  const totalImported = containers.reduce((s, c) => s + (c.total_import_cost_etb || 0), 0);
  const totalPaid = payments.filter(p => p.status === 'active').reduce((s, p) => s + (p.amount || 0), 0);
  const balance = totalImported - totalPaid;

  const entries = [
    ...containers.map(c => ({
      date: c.arrival_date || c.created_at,
      description: `Container ${c.container_number}`,
      type: 'container',
      debit: c.total_import_cost_etb || 0,
      credit: 0,
    })),
    ...payments.filter(p => p.status === 'active').map(p => ({
      date: p.payment_date || p.created_at,
      description: `Payment — ${p.payment_method || 'Transfer'}${p.notes ? ' · ' + p.notes : ''}`,
      type: 'payment',
      debit: 0,
      credit: p.amount || 0,
    })),
  ].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  let running = 0;
  entries.forEach(e => { running += e.debit - e.credit; e.balance = running; });

  function handleExportPDF() {
    exportReportPDF({
      filename: `supplier-statement-${supplier.name}`,
      title: `Supplier Statement — ${supplier.name}`,
      subtitle: `As of ${format(new Date(), 'MMM d, yyyy')}`,
      headers: ['Date', 'Description', 'Debit (ETB)', 'Credit (ETB)', 'Balance (ETB)'],
      rows: entries.map(e => [
        e.date ? format(new Date(e.date), 'MMM d, yyyy') : '—',
        e.description,
        e.debit > 0 ? fmt(e.debit) : '',
        e.credit > 0 ? fmt(e.credit) : '',
        fmt(e.balance),
      ]),
    });
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-2" />Back to Suppliers</Button>

      <PageHeader
        title={supplier.name}
        description={`${supplier.country || ''}${supplier.contact_person ? ' · ' + supplier.contact_person : ''}`}
        actions={
          <Button variant="outline" size="sm" onClick={handleExportPDF}>
            <FileText className="w-4 h-4 mr-1.5" />Export Statement
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Imported (ETB)', value: fmt(totalImported), color: '' },
          { label: 'Total Paid (ETB)', value: fmt(totalPaid), color: 'text-emerald-600' },
          { label: 'Outstanding (ETB)', value: fmt(balance), color: balance > 0 ? 'text-amber-600' : 'text-emerald-600' },
        ].map(c => (
          <div key={c.label} className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Containers summary */}
      {containers.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/40">
            <h3 className="font-semibold text-sm">Containers ({containers.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  {['Container #', 'Arrival', 'Product Cost (USD)', 'Import Cost (ETB)', 'Status'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {containers.map(c => (
                  <tr key={c.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2 font-mono font-medium">{c.container_number}</td>
                    <td className="px-4 py-2">{c.arrival_date ? format(new Date(c.arrival_date), 'MMM d, yyyy') : '—'}</td>
                    <td className="px-4 py-2 tabular-nums">{fmt(c.total_product_cost_usd)}</td>
                    <td className="px-4 py-2 tabular-nums font-semibold">{fmt(c.total_import_cost_etb)}</td>
                    <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ledger */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-muted/40">
          <h3 className="font-semibold text-sm">Account Ledger</h3>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No transactions yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  {['Date', 'Description', 'Debit (ETB)', 'Credit (ETB)', 'Balance (ETB)'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((e, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-4 py-2 whitespace-nowrap">{e.date ? format(new Date(e.date), 'MMM d, yyyy') : '—'}</td>
                    <td className="px-4 py-2 font-medium">{e.description}</td>
                    <td className="px-4 py-2 tabular-nums text-right">{e.debit > 0 ? fmt(e.debit) : '—'}</td>
                    <td className="px-4 py-2 tabular-nums text-right text-emerald-600">{e.credit > 0 ? fmt(e.credit) : '—'}</td>
                    <td className={`px-4 py-2 tabular-nums text-right font-semibold ${e.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{fmt(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AuditTrail record={supplier} />
    </div>
  );
}
