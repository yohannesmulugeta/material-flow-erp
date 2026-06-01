import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Warehouse as WarehouseIcon } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { logActivity } from '@/lib/activityLogger';

export default function Warehouses() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', location: '', description: '', status: 'active' });

  const { data: warehouses = [], isLoading } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.list() });

  const save = useMutation({
    mutationFn: async (data) => {
      if (editing) {
        await base44.entities.Warehouse.update(editing.id, data);
        await logActivity({ module: 'Warehouse', action: 'updated', entityType: 'Warehouse', entityId: editing.id, description: `Updated warehouse: ${data.name}` });
      } else {
        await base44.entities.Warehouse.create(data);
        await logActivity({ module: 'Warehouse', action: 'created', entityType: 'Warehouse', description: `Created warehouse: ${data.name}` });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); setOpen(false); setEditing(null); }
  });

  const openNew = () => { setEditing(null); setForm({ name: '', location: '', description: '', status: 'active' }); setOpen(true); };
  const openEdit = (w) => { setEditing(w); setForm({ name: w.name, location: w.location || '', description: w.description || '', status: w.status }); setOpen(true); };

  const columns = [
    { header: 'Name', accessorKey: 'name', cell: row => (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><WarehouseIcon className="w-4 h-4 text-primary" /></div>
        <span className="font-medium">{row.name}</span>
      </div>
    )},
    { header: 'Location', accessorKey: 'location' },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: '', cell: row => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(row); }}><Pencil className="w-3.5 h-3.5" /></Button> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Warehouses" description="Manage your warehouse locations" actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Add Warehouse</Button>} />
      <DataTable columns={columns} data={warehouses} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Warehouse' : 'New Warehouse'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
            <div><Label>Location</Label><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
            <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}