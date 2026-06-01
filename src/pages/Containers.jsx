import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Eye } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import ContainerDetail from '@/components/containers/ContainerDetail';
import { logActivity } from '@/lib/activityLogger';
import { format } from 'date-fns';

export default function Containers() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({
    container_number: '', supplier_id: '', supplier_name: '', country: '', arrival_date: '',
    currency: 'USD', exchange_rate: 0, freight_cost: 0, insurance_cost: 0, customs_cost: 0,
    transport_cost: 0, loading_cost: 0, unloading_cost: 0, other_costs: 0, status: 'in_transit',
    receiving_warehouse_id: '', notes: ''
  });

  const { data: containers = [], isLoading } = useQuery({ queryKey: ['containers'], queryFn: () => base44.entities.Container.list('-created_date') });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.list() });

  const save = useMutation({
    mutationFn: async (data) => {
      const supplier = suppliers.find(s => s.id === data.supplier_id);
      const payload = { ...data, supplier_name: supplier?.name || '' };
      const created = await base44.entities.Container.create(payload);
      await logActivity({ module: 'Container', action: 'created', entityType: 'Container', description: `Created container: ${data.container_number}` });
      return created;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['containers'] }); setOpen(false); }
  });

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  const columns = [
    { header: 'Container #', accessorKey: 'container_number', cell: row => <span className="font-mono font-medium">{row.container_number}</span> },
    { header: 'Supplier', accessorKey: 'supplier_name' },
    { header: 'Country', accessorKey: 'country' },
    { header: 'Arrival', cell: row => row.arrival_date ? format(new Date(row.arrival_date), 'MMM d, yyyy') : '—' },
    { header: 'Exchange Rate', cell: row => `1 USD = ${fmt(row.exchange_rate)} ETB` },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: '', cell: row => <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); setSelected(row); }}><Eye className="w-3.5 h-3.5" /></Button> },
  ];

  if (selected) return <ContainerDetail container={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Import Containers" description="Track imported shipments" actions={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />New Container</Button>} />
      <DataTable columns={columns} data={containers} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Import Container</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); save.mutate(form); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Container Number *</Label><Input value={form.container_number} onChange={e => setForm({ ...form, container_number: e.target.value })} required /></div>
              <div>
                <Label>Supplier</Label>
                <Select value={form.supplier_id} onValueChange={v => setForm({ ...form, supplier_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Country</Label><Input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} /></div>
              <div><Label>Arrival Date</Label><Input type="date" value={form.arrival_date} onChange={e => setForm({ ...form, arrival_date: e.target.value })} /></div>
              <div><Label>Exchange Rate (USD→ETB) *</Label><Input type="number" step="0.01" value={form.exchange_rate} onChange={e => setForm({ ...form, exchange_rate: Number(e.target.value) })} required /></div>
            </div>
            <div>
              <Label>Receiving Warehouse</Label>
              <Select value={form.receiving_warehouse_id} onValueChange={v => setForm({ ...form, receiving_warehouse_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <h4 className="text-sm font-semibold pt-2">Import Costs (ETB)</h4>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Freight</Label><Input type="number" step="0.01" value={form.freight_cost} onChange={e => setForm({ ...form, freight_cost: Number(e.target.value) })} /></div>
              <div><Label>Insurance</Label><Input type="number" step="0.01" value={form.insurance_cost} onChange={e => setForm({ ...form, insurance_cost: Number(e.target.value) })} /></div>
              <div><Label>Customs</Label><Input type="number" step="0.01" value={form.customs_cost} onChange={e => setForm({ ...form, customs_cost: Number(e.target.value) })} /></div>
              <div><Label>Transport</Label><Input type="number" step="0.01" value={form.transport_cost} onChange={e => setForm({ ...form, transport_cost: Number(e.target.value) })} /></div>
              <div><Label>Loading</Label><Input type="number" step="0.01" value={form.loading_cost} onChange={e => setForm({ ...form, loading_cost: Number(e.target.value) })} /></div>
              <div><Label>Unloading</Label><Input type="number" step="0.01" value={form.unloading_cost} onChange={e => setForm({ ...form, unloading_cost: Number(e.target.value) })} /></div>
              <div><Label>Other Costs</Label><Input type="number" step="0.01" value={form.other_costs} onChange={e => setForm({ ...form, other_costs: Number(e.target.value) })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={save.isPending}>{save.isPending ? 'Creating...' : 'Create Container'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}