import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { logActivity } from '@/lib/activityLogger';

export default function Suppliers() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', country: '', contact_person: '', phone: '', email: '', status: 'active' });

  const { data: suppliers = [], isLoading } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });

  const save = useMutation({
    mutationFn: async (data) => {
      if (editing) {
        await base44.entities.Supplier.update(editing.id, data);
        await logActivity({ module: 'Supplier', action: 'updated', entityType: 'Supplier', entityId: editing.id, description: `Updated supplier: ${data.name}` });
      } else {
        await base44.entities.Supplier.create(data);
        await logActivity({ module: 'Supplier', action: 'created', entityType: 'Supplier', description: `Created supplier: ${data.name}` });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); setOpen(false); setEditing(null); }
  });

  const openNew = () => { setEditing(null); setForm({ name: '', country: '', contact_person: '', phone: '', email: '', status: 'active' }); setOpen(true); };
  const openEdit = (s) => { setEditing(s); setForm({ name: s.name, country: s.country || '', contact_person: s.contact_person || '', phone: s.phone || '', email: s.email || '', status: s.status }); setOpen(true); };

  const columns = [
    { header: 'Name', accessorKey: 'name', cell: row => <span className="font-medium">{row.name}</span> },
    { header: 'Country', accessorKey: 'country' },
    { header: 'Contact', accessorKey: 'contact_person' },
    { header: 'Phone', accessorKey: 'phone' },
    { header: 'Email', accessorKey: 'email' },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: '', cell: row => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(row); }}><Pencil className="w-3.5 h-3.5" /></Button> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Suppliers" description="Manage your suppliers" actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Add Supplier</Button>} />
      <DataTable columns={columns} data={suppliers} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Supplier' : 'New Supplier'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Country</Label><Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
              <div><Label>Contact Person</Label><Input value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}