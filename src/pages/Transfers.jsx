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

export default function Transfers() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: '', quantity: 0, source_warehouse_id: '', destination_warehouse_id: '', reason: '', transfer_date: format(new Date(), 'yyyy-MM-dd') });

  const { data: transfers = [], isLoading } = useQuery({ queryKey: ['transfers'], queryFn: () => base44.entities.Transfer.list('-created_date') });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.filter({ status: 'active' }) });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });

  const selectedInventory = inventory.filter(i => i.warehouse_id === form.source_warehouse_id);

  const createTransfer = useMutation({
    mutationFn: async (data) => {
      const prod = products.find(p => p.id === data.product_id);
      const srcWh = warehouses.find(w => w.id === data.source_warehouse_id);
      const destWh = warehouses.find(w => w.id === data.destination_warehouse_id);
      const srcInv = inventory.find(i => i.product_id === data.product_id && i.warehouse_id === data.source_warehouse_id);
      if (srcInv && data.quantity > srcInv.quantity) throw new Error(`Only ${srcInv.quantity} units available in source warehouse`);
      await base44.entities.Transfer.create({
        ...data,
        product_name: prod?.name || '',
        source_warehouse_name: srcWh?.name || '',
        destination_warehouse_name: destWh?.name || '',
        status: 'pending',
      });
      await logActivity({ module: 'Transfer', action: 'created', entityType: 'Transfer', description: `Transfer request: ${prod?.name} (${data.quantity}) from ${srcWh?.name} to ${destWh?.name}` });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); setOpen(false); setForm({ product_id: '', quantity: 0, source_warehouse_id: '', destination_warehouse_id: '', reason: '', transfer_date: format(new Date(), 'yyyy-MM-dd') }); },
    onError: (err) => alert(err.message),
  });

  const columns = [
    { header: 'Product', accessorKey: 'product_name', cell: row => <span className="font-medium">{row.product_name}</span> },
    { header: 'Qty', accessorKey: 'quantity', cell: row => <span className="tabular-nums font-semibold">{row.quantity}</span> },
    { header: 'From', accessorKey: 'source_warehouse_name' },
    { header: 'To', accessorKey: 'destination_warehouse_name' },
    { header: 'Reason', accessorKey: 'reason', cell: row => <span className="text-sm truncate max-w-xs block">{row.reason}</span> },
    { header: 'Date', cell: row => row.transfer_date ? format(new Date(row.transfer_date), 'MMM d, yyyy') : '—' },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
  ];

  const srcInvForSelected = inventory.find(i => i.product_id === form.product_id && i.warehouse_id === form.source_warehouse_id);

  return (
    <div className="space-y-4">
      <PageHeader title="Transfers" description="Transfer inventory between warehouses"
        actions={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />New Transfer</Button>}
      />
      <DataTable columns={columns} data={transfers} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Transfer Request</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createTransfer.mutate(form); }} className="space-y-4">
            <div>
              <Label>Source Warehouse *</Label>
              <Select value={form.source_warehouse_id} onValueChange={v => setForm({ ...form, source_warehouse_id: v, product_id: '' })}>
                <SelectTrigger><SelectValue placeholder="From warehouse" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Product *</Label>
              <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {selectedInventory.filter(i => (i.quantity || 0) > 0).map(i => (
                    <SelectItem key={i.product_id} value={i.product_id}>{i.product_name} — {i.quantity} available</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity * {srcInvForSelected ? `(max ${srcInvForSelected.quantity})` : ''}</Label>
              <Input type="number" min="1" max={srcInvForSelected?.quantity} value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} required />
            </div>
            <div>
              <Label>Destination Warehouse *</Label>
              <Select value={form.destination_warehouse_id} onValueChange={v => setForm({ ...form, destination_warehouse_id: v })}>
                <SelectTrigger><SelectValue placeholder="To warehouse" /></SelectTrigger>
                <SelectContent>{warehouses.filter(w => w.id !== form.source_warehouse_id).map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Reason *</Label><Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required /></div>
            <div><Label>Date</Label><Input type="date" value={form.transfer_date} onChange={e => setForm({ ...form, transfer_date: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Transfer will be sent to the Approval Center for admin review.</p>
            <Button type="submit" className="w-full" disabled={createTransfer.isPending}>{createTransfer.isPending ? 'Submitting...' : 'Submit Request'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
