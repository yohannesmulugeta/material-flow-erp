import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Eye } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import CustomerLedger from '@/components/customers/CustomerLedger';
import { logActivity } from '@/lib/activityLogger';

export default function Customers() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [ledgerCustomer, setLedgerCustomer] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', credit_limit: 0, status: 'active' });

  const { data: customers = [], isLoading } = useQuery({ queryKey: ['customers'], queryFn: () => base44.entities.Customer.list() });

  const save = useMutation({
    mutationFn: async (data) => {
      if (editing) {
        await base44.entities.Customer.update(editing.id, data);
        await logActivity({ module: 'Customer', action: 'updated', entityType: 'Customer', entityId: editing.id, description: `Updated customer: ${data.name}` });
      } else {
        await base44.entities.Customer.create(data);
        await logActivity({ module: 'Customer', action: 'created', entityType: 'Customer', description: `Created customer: ${data.name}` });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); setOpen(false); setEditing(null); }
  });

  const openNew = () => { setEditing(null); setForm({ name: '', phone: '', email: '', address: '', credit_limit: 0, status: 'active' }); setOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ name: c.name, phone: c.phone || '', email: c.email || '', address: c.address || '', credit_limit: c.credit_limit || 0, status: c.status }); setOpen(true); };
  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  if (ledgerCustomer) return <CustomerLedger customer={ledgerCustomer} onBack={() => setLedgerCustomer(null)} />;

  const columns = [
    { header: 'Name', accessorKey: 'name', cell: row => <span className="font-medium">{row.name}</span> },
    { header: 'Phone', accessorKey: 'phone' },
    { header: 'Credit', cell: row => <span className="font-semibold">ETB {fmt(row.total_credit)}</span> },
    { header: 'Paid', cell: row => `ETB ${fmt(row.total_paid)}` },
    { header: 'Balance', cell: row => <span className={`font-semibold ${(row.balance || 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>ETB {fmt(row.balance)}</span> },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: '', cell: row => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); setLedgerCustomer(row); }}><Eye className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(row); }}><Pencil className="w-3.5 h-3.5" /></Button>
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Customers" description="Manage customer accounts and credit" actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Add Customer</Button>} />
      <DataTable columns={columns} data={customers} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Customer' : 'New Customer'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div><Label>Credit Limit (ETB)</Label><Input type="number" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: Number(e.target.value) })} /></div>
            <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}