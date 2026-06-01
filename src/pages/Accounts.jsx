import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Eye, Building2, Wallet } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { logActivity } from '@/lib/activityLogger';
import { format } from 'date-fns';

export default function Accounts() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [txOpen, setTxOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [form, setForm] = useState({ name: '', type: 'formal', description: '', status: 'active' });

  const { data: accounts = [], isLoading } = useQuery({ queryKey: ['accounts'], queryFn: () => base44.entities.Account.list() });
  const { data: transactions = [] } = useQuery({
    queryKey: ['account-tx', selectedAccount?.id],
    queryFn: () => selectedAccount ? base44.entities.AccountTransaction.filter({ account_id: selectedAccount.id }, '-created_date') : [],
    enabled: !!selectedAccount,
  });

  const save = useMutation({
    mutationFn: async (data) => {
      if (editing) {
        await base44.entities.Account.update(editing.id, data);
        await logActivity({ module: 'Account', action: 'updated', entityType: 'Account', entityId: editing.id, description: `Updated account: ${data.name}` });
      } else {
        await base44.entities.Account.create(data);
        await logActivity({ module: 'Account', action: 'created', entityType: 'Account', description: `Created account: ${data.name}` });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setOpen(false); setEditing(null); }
  });

  const openNew = () => { setEditing(null); setForm({ name: '', type: 'formal', description: '', status: 'active' }); setOpen(true); };
  const openEdit = (a) => { setEditing(a); setForm({ name: a.name, type: a.type, description: a.description || '', status: a.status }); setOpen(true); };
  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  const columns = [
    { header: 'Account', accessorKey: 'name', cell: row => (
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${row.type === 'formal' ? 'bg-blue-500/10' : 'bg-purple-500/10'}`}>
          {row.type === 'formal' ? <Building2 className="w-4 h-4 text-blue-500" /> : <Wallet className="w-4 h-4 text-purple-500" />}
        </div>
        <span className="font-medium">{row.name}</span>
      </div>
    )},
    { header: 'Type', cell: row => <StatusBadge status={row.type} /> },
    { header: 'Balance', cell: row => <span className="font-semibold">ETB {fmt(row.balance)}</span> },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: '', cell: row => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); setSelectedAccount(row); setTxOpen(true); }}><Eye className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(row); }}><Pencil className="w-3.5 h-3.5" /></Button>
      </div>
    )},
  ];

  const txColumns = [
    { header: 'Date', cell: row => format(new Date(row.created_date), 'MMM d, yyyy h:mm a') },
    { header: 'Type', cell: row => <StatusBadge status={row.type} /> },
    { header: 'Amount', cell: row => <span className="font-semibold">ETB {fmt(row.amount)}</span> },
    { header: 'Balance', cell: row => `ETB ${fmt(row.balance_after)}` },
    { header: 'Notes', accessorKey: 'notes' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Accounts" description="Manage formal and informal accounts" actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Add Account</Button>} />
      <DataTable columns={columns} data={accounts} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Account' : 'New Account'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="formal">Formal</SelectItem><SelectItem value="informal">Informal</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={txOpen} onOpenChange={setTxOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Transactions — {selectedAccount?.name}</DialogTitle></DialogHeader>
          <DataTable columns={txColumns} data={transactions} searchable={false} pageSize={10} />
        </DialogContent>
      </Dialog>
    </div>
  );
}