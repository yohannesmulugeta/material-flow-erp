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

export default function Damages() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: '', warehouse_id: '', quantity: 0, reason: '', type: 'damage' });

  const { data: damages = [], isLoading } = useQuery({ queryKey: ['damages'], queryFn: () => base44.entities.DamageRecord.list('-created_date') });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.filter({ status: 'active' }) });

  const createDamage = useMutation({
    mutationFn: async (data) => {
      const prod = products.find(p => p.id === data.product_id);
      const wh = warehouses.find(w => w.id === data.warehouse_id);
      await base44.entities.DamageRecord.create({
        ...data, product_name: prod?.name || '', warehouse_name: wh?.name || '', status: 'pending',
      });
      await logActivity({ module: 'Damage', action: 'created', entityType: 'DamageRecord', description: `Recorded ${data.type}: ${prod?.name} x${data.quantity}` });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['damages'] }); setOpen(false); setForm({ product_id: '', warehouse_id: '', quantity: 0, reason: '', type: 'damage' }); }
  });

  const columns = [
    { header: 'Product', accessorKey: 'product_name', cell: row => <span className="font-medium">{row.product_name}</span> },
    { header: 'Warehouse', accessorKey: 'warehouse_name' },
    { header: 'Qty', accessorKey: 'quantity', cell: row => <span className="tabular-nums font-semibold">{row.quantity}</span> },
    { header: 'Type', cell: row => <StatusBadge status={row.type} /> },
    { header: 'Reason', accessorKey: 'reason' },
    { header: 'Recorded By', accessorKey: 'recorded_by' },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Damage & Loss" description="Record damaged or lost inventory"
        actions={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />Record</Button>}
      />
      <DataTable columns={columns} data={damages} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Damage / Loss</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createDamage.mutate(form); }} className="space-y-4">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="damage">Damage</SelectItem><SelectItem value="loss">Loss</SelectItem></SelectContent>
              </Select>
            </div>
            <div>
              <Label>Product *</Label>
              <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{products.filter(p => p.status === 'active').map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Warehouse *</Label>
              <Select value={form.warehouse_id} onValueChange={v => setForm({ ...form, warehouse_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantity *</Label><Input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} required /></div>
            <div><Label>Reason *</Label><Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required /></div>
            <p className="text-xs text-muted-foreground">This record will be sent to the Approval Center for admin review before stock is deducted.</p>
            <Button type="submit" className="w-full" disabled={createDamage.isPending}>{createDamage.isPending ? 'Saving...' : 'Submit'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
