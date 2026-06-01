import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { logActivity } from '@/lib/activityLogger';
import { format } from 'date-fns';

export default function Payments() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'customer_payment', reference_id: '', amount: 0, payment_method: '', account_id: '', notes: '', payment_date: format(new Date(), 'yyyy-MM-dd') });

  const { data: payments = [], isLoading } = useQuery({ queryKey: ['payments'], queryFn: () => base44.entities.Payment.list('-created_date') });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => base44.entities.Customer.list() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => base44.entities.Account.filter({ status: 'active' }) });

  const save = useMutation({
    mutationFn: async (data) => {
      const reference = data.type === 'customer_payment'
        ? customers.find(c => c.id === data.reference_id)
        : suppliers.find(s => s.id === data.reference_id);
      const account = accounts.find(a => a.id === data.account_id);

      await base44.entities.Payment.create({
        ...data,
        reference_name: reference?.name || '',
        account_name: account?.name || '',
        status: 'active',
      });

      // Update customer/supplier balance
      if (data.type === 'customer_payment' && reference) {
        await base44.entities.Customer.update(reference.id, {
          total_paid: (reference.total_paid || 0) + data.amount,
          balance: (reference.balance || 0) - data.amount,
        });
      }

      // Update account balance
      if (account) {
        await base44.entities.Account.update(account.id, { balance: (account.balance || 0) + data.amount });
        await base44.entities.AccountTransaction.create({
          account_id: account.id, account_name: account.name,
          type: 'deposit', amount: data.amount,
          reference_type: data.type, reference_id: data.reference_id,
          notes: `${data.type === 'customer_payment' ? 'Customer' : 'Supplier'} payment: ${reference?.name}`,
          balance_after: (account.balance || 0) + data.amount,
        });
      }

      await logActivity({ module: 'Payment', action: 'created', entityType: 'Payment', description: `Received payment of ETB ${data.amount} from ${reference?.name}` });
    },
    onSuccess: () => { qc.invalidateQueries(); setOpen(false); }
  });

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const referenceList = form.type === 'customer_payment' ? customers : suppliers;

  const columns = [
    { header: 'Type', cell: row => <StatusBadge status={row.type === 'customer_payment' ? 'cash' : 'credit'} /> },
    { header: 'From/To', accessorKey: 'reference_name', cell: row => <span className="font-medium">{row.reference_name}</span> },
    { header: 'Amount', cell: row => <span className="font-semibold">ETB {fmt(row.amount)}</span> },
    { header: 'Account', accessorKey: 'account_name' },
    { header: 'Date', cell: row => row.payment_date ? format(new Date(row.payment_date), 'MMM d, yyyy') : '—' },
    { header: 'Notes', accessorKey: 'notes' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Payments" description="Record and track payments" actions={<Button onClick={() => { setForm({ type: 'customer_payment', reference_id: '', amount: 0, payment_method: '', account_id: '', notes: '', payment_date: format(new Date(), 'yyyy-MM-dd') }); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />Record Payment</Button>} />
      <DataTable columns={columns} data={payments} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
            <div>
              <Label>Payment Type</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v, reference_id: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer_payment">Customer Payment</SelectItem>
                  <SelectItem value="supplier_payment">Supplier Payment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{form.type === 'customer_payment' ? 'Customer' : 'Supplier'} *</Label>
              <Select value={form.reference_id} onValueChange={v => setForm({ ...form, reference_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{referenceList.map(r => <SelectItem key={r.id} value={r.id}>{r.name} {r.balance ? `(Bal: ETB ${fmt(r.balance)})` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount (ETB) *</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} required /></div>
            <div>
              <Label>To Account</Label>
              <Select value={form.account_id} onValueChange={v => setForm({ ...form, account_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Date</Label><Input type="date" value={form.payment_date} onChange={e => setForm({ ...form, payment_date: e.target.value })} /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Record Payment'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}