import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Eye } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import AuditTrail from '@/components/ui/AuditTrail';
import { logActivity } from '@/lib/activityLogger';
import { format } from 'date-fns';

const ADMIN_ROLES = ['super_admin', 'admin', 'manager', 'accountant'];

export default function Payments() {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const isAdmin = ADMIN_ROLES.includes(role);

  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [form, setForm] = useState({ type: 'customer_payment', reference_id: '', amount: 0, payment_method: '', account_id: '', notes: '', payment_date: format(new Date(), 'yyyy-MM-dd') });
  const [editForm, setEditForm] = useState({});
  const [editReason, setEditReason] = useState('');

  const { data: payments = [], isLoading } = useQuery({ queryKey: ['payments'], queryFn: () => base44.entities.Payment.list('-created_date') });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => base44.entities.Customer.list() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: () => base44.entities.Account.filter({ status: 'active' }) });

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const referenceList = form.type === 'customer_payment' ? customers : suppliers;

  // CREATE
  const save = useMutation({
    mutationFn: async (data) => {
      const reference = data.type === 'customer_payment' ? customers.find(c => c.id === data.reference_id) : suppliers.find(s => s.id === data.reference_id);
      const account = accounts.find(a => a.id === data.account_id);
      await base44.entities.Payment.create({ ...data, reference_name: reference?.name || '', account_name: account?.name || '', status: 'active' });
      if (data.type === 'customer_payment' && reference) {
        await base44.entities.Customer.update(reference.id, { total_paid: (reference.total_paid || 0) + data.amount, balance: (reference.balance || 0) - data.amount });
      }
      if (account) {
        await base44.entities.Account.update(account.id, { balance: (account.balance || 0) + data.amount });
        await base44.entities.AccountTransaction.create({ account_id: account.id, account_name: account.name, type: 'deposit', amount: data.amount, reference_type: data.type, reference_id: data.reference_id, notes: `Payment: ${reference?.name}`, balance_after: (account.balance || 0) + data.amount });
      }
      await logActivity({ module: 'Payment', action: 'created', entityType: 'Payment', description: `Received ETB ${fmt(data.amount)} from ${reference?.name}` });
    },
    onSuccess: () => { qc.invalidateQueries(); setOpen(false); }
  });

  // REQUEST EDIT (non-admin) or DIRECT EDIT (admin)
  const requestEdit = useMutation({
    mutationFn: async () => {
      if (isAdmin) {
        // Admin: apply directly
        await base44.entities.Payment.update(editing.id, { ...editForm });
        await logActivity({ module: 'Payment', action: 'updated', entityType: 'Payment', entityId: editing.id, description: `Updated payment for ${editing.reference_name}` });
      } else {
        // Non-admin: create approval request
        await base44.entities.ApprovalRequest.create({
          type: 'payment_edit',
          reference_id: editing.id,
          reference_type: 'Payment',
          reference_label: `Payment — ${editing.reference_name} — ETB ${fmt(editing.amount)}`,
          requested_by: user?.full_name || user?.email || 'Unknown',
          notes: editReason,
          payload: JSON.stringify(editForm),
          status: 'pending',
        });
        await logActivity({ module: 'Payment', action: 'edit_requested', entityType: 'Payment', entityId: editing.id, description: `Edit requested for payment ${editing.reference_name}` });
      }
    },
    onSuccess: () => { qc.invalidateQueries(); setEditOpen(false); setEditing(null); setEditReason(''); }
  });

  // REQUEST DELETE (non-admin) or SOFT DELETE (admin)
  const requestDelete = useMutation({
    mutationFn: async (payment) => {
      if (isAdmin) {
        await base44.entities.Payment.update(payment.id, { status: 'cancelled', archived: true, archived_at: new Date().toISOString() });
        await logActivity({ module: 'Payment', action: 'cancelled', entityType: 'Payment', entityId: payment.id, description: `Cancelled payment for ${payment.reference_name}` });
      } else {
        await base44.entities.ApprovalRequest.create({
          type: 'payment_delete',
          reference_id: payment.id,
          reference_type: 'Payment',
          reference_label: `Payment — ${payment.reference_name} — ETB ${fmt(payment.amount)}`,
          requested_by: user?.full_name || user?.email || 'Unknown',
          notes: 'Deletion requested',
          status: 'pending',
        });
        await logActivity({ module: 'Payment', action: 'delete_requested', entityType: 'Payment', entityId: payment.id, description: `Delete requested for payment ${payment.reference_name}` });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] })
  });

  const openEdit = (p) => {
    setEditing(p);
    setEditForm({ amount: p.amount, payment_method: p.payment_method || '', notes: p.notes || '', payment_date: p.payment_date || '' });
    setEditOpen(true);
  };

  const activePayments = payments.filter(p => !p.archived);

  const columns = [
    { header: 'Type', cell: row => <Badge variant="outline" className="text-xs">{row.type === 'customer_payment' ? 'Customer' : 'Supplier'}</Badge> },
    { header: 'From / To', accessorKey: 'reference_name', cell: row => <span className="font-medium">{row.reference_name}</span> },
    { header: 'Amount (ETB)', cell: row => <span className="font-semibold tabular-nums">ETB {fmt(row.amount)}</span> },
    { header: 'Method', accessorKey: 'payment_method' },
    { header: 'Account', accessorKey: 'account_name' },
    { header: 'Date', cell: row => row.payment_date ? format(new Date(row.payment_date), 'MMM d, yyyy') : '—' },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: 'Actions', cell: row => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={e => { e.stopPropagation(); setViewing(row); setViewOpen(true); }}><Eye className="w-3.5 h-3.5" /></Button>
        {row.status === 'active' && (
          <>
            <Button variant="ghost" size="icon" className="h-8 w-8" title={isAdmin ? 'Edit' : 'Request Edit'} onClick={e => { e.stopPropagation(); openEdit(row); }}><Pencil className="w-3.5 h-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title={isAdmin ? 'Cancel' : 'Request Deletion'}
              onClick={e => { e.stopPropagation(); if (window.confirm(`${isAdmin ? 'Cancel' : 'Request deletion of'} this payment?`)) requestDelete.mutate(row); }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Payments" description="Record and track payments"
        actions={<Button onClick={() => { setForm({ type: 'customer_payment', reference_id: '', amount: 0, payment_method: '', account_id: '', notes: '', payment_date: format(new Date(), 'yyyy-MM-dd') }); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />Record Payment</Button>}
      />
      <DataTable columns={columns} data={activePayments} isLoading={isLoading} />

      {/* New Payment Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
            <div>
              <Label>Payment Type</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v, reference_id: '' })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="customer_payment">Customer Payment</SelectItem><SelectItem value="supplier_payment">Supplier Payment</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>{form.type === 'customer_payment' ? 'Customer' : 'Supplier'} *</Label>
              <Select value={form.reference_id} onValueChange={v => setForm({ ...form, reference_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{referenceList.map(r => <SelectItem key={r.id} value={r.id}>{r.name}{r.balance ? ` — Bal: ETB ${fmt(r.balance)}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Amount (ETB) *</Label><Input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} required /></div>
            <div><Label>Payment Method</Label><Input value={form.payment_method} onChange={e => setForm({ ...form, payment_method: e.target.value })} placeholder="Cash, Bank Transfer, Cheque..." /></div>
            <div>
              <Label>Deposit to Account</Label>
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

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={v => { setEditOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isAdmin ? 'Edit Payment' : 'Request Payment Edit'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              {!isAdmin && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                  You are requesting an edit. An admin must approve before changes apply.
                </div>
              )}
              <div><Label>Amount (ETB)</Label><Input type="number" step="0.01" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: Number(e.target.value) })} /></div>
              <div><Label>Payment Method</Label><Input value={editForm.payment_method} onChange={e => setEditForm({ ...editForm, payment_method: e.target.value })} /></div>
              <div><Label>Date</Label><Input type="date" value={editForm.payment_date} onChange={e => setEditForm({ ...editForm, payment_date: e.target.value })} /></div>
              <div><Label>Notes</Label><Textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
              {!isAdmin && <div><Label>Reason for change *</Label><Textarea value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="Why are you editing this payment?" required /></div>}
              <Button className="w-full" onClick={() => requestEdit.mutate()} disabled={requestEdit.isPending || (!isAdmin && !editReason.trim())}>
                {requestEdit.isPending ? 'Saving...' : isAdmin ? 'Save Changes' : 'Submit Edit Request'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={viewOpen} onOpenChange={setViewOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Payment Details</DialogTitle></DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              {[['Type', viewing.type === 'customer_payment' ? 'Customer Payment' : 'Supplier Payment'],
                ['From/To', viewing.reference_name],
                ['Amount', `ETB ${fmt(viewing.amount)}`],
                ['Method', viewing.payment_method || '—'],
                ['Account', viewing.account_name || '—'],
                ['Date', viewing.payment_date ? format(new Date(viewing.payment_date), 'MMM d, yyyy') : '—'],
                ['Status', viewing.status],
                ['Notes', viewing.notes || '—'],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right">{val}</span>
                </div>
              ))}
              <AuditTrail record={viewing} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
