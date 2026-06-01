import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import { format } from 'date-fns';

export default function CustomerLedger({ customer, onBack }) {
  const { data: sales = [] } = useQuery({
    queryKey: ['customer-sales', customer.id],
    queryFn: () => base44.entities.Sale.filter({ customer_id: customer.id }, '-created_date')
  });
  const { data: payments = [] } = useQuery({
    queryKey: ['customer-payments', customer.id],
    queryFn: () => base44.entities.Payment.filter({ reference_id: customer.id, type: 'customer_payment' }, '-created_date')
  });

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  // Build ledger entries
  const entries = [];
  sales.filter(s => s.status === 'completed').forEach(s => {
    entries.push({ date: s.sale_date || s.created_date, description: `Sale ${s.invoice_number}`, debit: s.total || 0, credit: 0, type: 'sale' });
  });
  payments.filter(p => p.status === 'active').forEach(p => {
    entries.push({ date: p.payment_date || p.created_date, description: `Payment - ${p.notes || 'Payment received'}`, debit: 0, credit: p.amount || 0, type: 'payment' });
  });
  entries.sort((a, b) => new Date(a.date) - new Date(b.date));
  
  let runningBalance = 0;
  entries.forEach(e => { runningBalance += e.debit - e.credit; e.balance = runningBalance; });

  const columns = [
    { header: 'Date', cell: row => row.date ? format(new Date(row.date), 'MMM d, yyyy') : '—' },
    { header: 'Description', accessorKey: 'description', cell: row => <span className="font-medium">{row.description}</span> },
    { header: 'Debit', cell: row => row.debit > 0 ? `ETB ${fmt(row.debit)}` : '—' },
    { header: 'Credit', cell: row => row.credit > 0 ? `ETB ${fmt(row.credit)}` : '—' },
    { header: 'Balance', cell: row => <span className={`font-semibold ${row.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>ETB {fmt(row.balance)}</span> },
  ];

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
      <PageHeader title={`Ledger: ${customer.name}`} description={`Balance: ETB ${fmt(customer.balance)}`} />
      <DataTable columns={columns} data={entries} searchable={false} />
    </div>
  );
}