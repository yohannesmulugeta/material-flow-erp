import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Eye, Pencil, Ban } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import ContainerDetail from '@/components/containers/ContainerDetail';
import { logActivity } from '@/lib/activityLogger';
import { format } from 'date-fns';

const EMPTY_FORM = {
  container_number: '', supplier_id: '', supplier_name: '', country: '', arrival_date: '',
  currency: 'USD', exchange_rate: 0, freight_cost: 0, insurance_cost: 0, customs_cost: 0,
  transport_cost: 0, loading_cost: 0, unloading_cost: 0, other_costs: 0, status: 'in_transit',
  receiving_warehouse_id: '', notes: ''
};

export default function Containers() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: containers = [], isLoading } = useQuery({ queryKey: ['containers'], queryFn: () => base44.entities.Container.list('-created_date') });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.list() });

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = useMutation({
    mutationFn: async (data) => {
      const supplier = suppliers.find(s => s.id === data.supplier_id);
      const payload = { ...data, supplier_name: supplier?.name || data.supplier_name || '' };
      if (editing) {
        await base44.entities.Container.update(editing.id, payload);
        await logActivity({ module: 'Container', action: 'updated', entityType: 'Container', entityId: editing.id, description: `Updated container: ${data.container_number}` });
      } else {
        await base44.entities.Container.create(payload);
        await logActivity({ module: 'Container', action: 'created', entityType: 'Container', description: `Created container: ${data.container_number}` });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['containers'] }); setOpen(false); setEditing(null); setForm(EMPTY_FORM); }
  });

  // Soft cancel — never hard-delete
  const cancel = useMutation({
    mutationFn: async (c) => {
      if (!window.confirm(`Cancel container ${c.container_number}? This cannot be undone.`)) throw new Error('cancelled');
      await base44.entities.Container.update(c.id, { status: 'closed' });
      await logActivity({ module: 'Container', action: 'cancelled', entityType: 'Container', entityId: c.id, description: `Cancelled container: ${c.container_number}` });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['containers'] }),
    onError: () => {}
  });

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      container_number: c.container_number, supplier_id: c.supplier_id || '', supplier_name: c.supplier_name || '',
      country: c.country || '', arrival_date: c.arrival_date || '', currency: c.currency || 'USD',
      exchange_rate: c.exchange_rate || 0, freight_cost: c.freight_cost || 0,
      insurance_cost: c.insurance_cost || 0, customs_cost: c.customs_cost || 0,
      transport_cost: c.transport_cost || 0, loading_cost: c.loading_cost || 0,
      unloading_cost: c.unloading_cost || 0, other_costs: c.other_costs || 0,
      status: c.status, receiving_warehouse_id: c.receiving_warehouse_id || '', notes: c.notes || ''
    });
    setOpen(true);
  };

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  const columns = [
    { header: 'Container #', accessorKey: 'container_number', cell: row => <span className="font-mono font-medium">{row.container_number}</span> },
    { header: 'Supplier', accessorKey: 'supplier_name' },
    { header: 'Country', accessorKey: 'country' },
    { header: 'Arrival', cell: row => row.arrival_date ? format(new Date(row.arrival_date), 'MMM d, yyyy') : '—' },
    { header: 'Total Cost (ETB)', cell: row => <span className="tabular-nums">{fmt(row.total_import_cost_etb)}</span> },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: 'Actions', cell: row => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" title="View" onClick={e => { e.stopPropagation(); setSelected(row); }}><Eye className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={e => { e.stopPropagation(); openEdit(row); }}><Pencil className="w-3.5 h-3.5" /></Button>
        {row.status !== 'closed' && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Cancel" onClick={e => { e.stopPropagation(); cancel.mutate(row); }}><Ban className="w-3.5 h-3.5" /></Button>
        )}
      </div>
    )},
  ];

  if (selected) return <ContainerDetail container={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Import Containers" description="Track imported shipments"
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />New Container</Button>}
      />
      <DataTable columns={columns} data={containers} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setForm(EMPTY_FORM); } }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Container' : 'New Import Container'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Container Number *</Label><Input value={form.container_number} onChange={e => f('container_number', e.target.value)} required /></div>
              <div>
                <Label>Supplier</Label>
                <Select value={form.supplier_id} onValueChange={v => f('supplier_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Country</Label><Input value={form.country} onChange={e => f('country', e.target.value)} /></div>
              <div><Label>Arrival Date</Label><Input type="date" value={form.arrival_date} onChange={e => f('arrival_date', e.target.value)} /></div>
              <div><Label>Exchange Rate (1 USD = ? ETB)</Label><Input type="number" step="0.01" value={form.exchange_rate} onChange={e => f('exchange_rate', Number(e.target.value))} required /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => f('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_transit">In Transit</SelectItem>
                    <SelectItem value="arrived">Arrived</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Receiving Warehouse</Label>
                <Select value={form.receiving_warehouse_id} onValueChange={v => f('receiving_warehouse_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <h4 className="text-sm font-semibold pt-2 border-t">Import Costs (ETB)</h4>
            <div className="grid grid-cols-2 gap-4">
              {[['freight_cost','Freight'],['insurance_cost','Insurance'],['customs_cost','Customs'],['transport_cost','Transport'],['loading_cost','Loading'],['unloading_cost','Unloading'],['other_costs','Other']].map(([field, label]) => (
                <div key={field}><Label>{label}</Label><Input type="number" step="0.01" value={form[field]} onChange={e => f(field, Number(e.target.value))} /></div>
              ))}
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => f('notes', e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? 'Saving...' : editing ? 'Update Container' : 'Create Container'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
