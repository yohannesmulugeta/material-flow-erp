import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Check, X } from 'lucide-react';
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

  const createTransfer = useMutation({
    mutationFn: async (data) => {
      const prod = products.find(p => p.id === data.product_id);
      const srcWh = warehouses.find(w => w.id === data.source_warehouse_id);
      const destWh = warehouses.find(w => w.id === data.destination_warehouse_id);
      await base44.entities.Transfer.create({
        ...data,
        product_name: prod?.name || '',
        source_warehouse_name: srcWh?.name || '',
        destination_warehouse_name: destWh?.name || '',
        status: 'pending',
      });
      await logActivity({ module: 'Transfer', action: 'created', entityType: 'Transfer', description: `Transfer request: ${prod?.name} from ${srcWh?.name} to ${destWh?.name}` });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); setOpen(false); }
  });

  const approveTransfer = useMutation({
    mutationFn: async (transfer) => {
      // Move stock
      const srcInv = inventory.find(i => i.product_id === transfer.product_id && i.warehouse_id === transfer.source_warehouse_id);
      if (!srcInv || srcInv.quantity < transfer.quantity) throw new Error('Insufficient stock');

      const newSrcQty = srcInv.quantity - transfer.quantity;
      await base44.entities.InventoryStock.update(srcInv.id, { quantity: newSrcQty, total_value_etb: newSrcQty * (srcInv.avg_cost_etb || 0) });

      const destInv = inventory.find(i => i.product_id === transfer.product_id && i.warehouse_id === transfer.destination_warehouse_id);
      if (destInv) {
        const newDestQty = (destInv.quantity || 0) + transfer.quantity;
        const newTotalValue = newDestQty * (srcInv.avg_cost_etb || 0);
        await base44.entities.InventoryStock.update(destInv.id, { quantity: newDestQty, avg_cost_etb: srcInv.avg_cost_etb, total_value_etb: newTotalValue });
      } else {
        await base44.entities.InventoryStock.create({
          product_id: transfer.product_id, product_name: transfer.product_name,
          warehouse_id: transfer.destination_warehouse_id, warehouse_name: transfer.destination_warehouse_name,
          quantity: transfer.quantity, avg_cost_etb: srcInv.avg_cost_etb || 0,
          total_value_etb: transfer.quantity * (srcInv.avg_cost_etb || 0),
        });
      }

      // Stock transactions
      await base44.entities.StockTransaction.create({ product_id: transfer.product_id, product_name: transfer.product_name, warehouse_id: transfer.source_warehouse_id, warehouse_name: transfer.source_warehouse_name, type: 'stock_out', reason: 'transfer_out', quantity: transfer.quantity, reference_id: transfer.id, reference_type: 'Transfer' });
      await base44.entities.StockTransaction.create({ product_id: transfer.product_id, product_name: transfer.product_name, warehouse_id: transfer.destination_warehouse_id, warehouse_name: transfer.destination_warehouse_name, type: 'stock_in', reason: 'transfer_in', quantity: transfer.quantity, reference_id: transfer.id, reference_type: 'Transfer' });

      await base44.entities.Transfer.update(transfer.id, { status: 'completed' });
      await logActivity({ module: 'Transfer', action: 'approved', entityType: 'Transfer', entityId: transfer.id, description: `Approved transfer of ${transfer.product_name}` });
    },
    onSuccess: () => qc.invalidateQueries()
  });

  const rejectTransfer = useMutation({
    mutationFn: async (transfer) => {
      await base44.entities.Transfer.update(transfer.id, { status: 'rejected' });
      await logActivity({ module: 'Transfer', action: 'rejected', entityType: 'Transfer', entityId: transfer.id, description: `Rejected transfer of ${transfer.product_name}` });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] })
  });

  const columns = [
    { header: 'Product', accessorKey: 'product_name', cell: row => <span className="font-medium">{row.product_name}</span> },
    { header: 'Qty', accessorKey: 'quantity' },
    { header: 'From', accessorKey: 'source_warehouse_name' },
    { header: 'To', accessorKey: 'destination_warehouse_name' },
    { header: 'Reason', accessorKey: 'reason' },
    { header: 'Date', cell: row => row.transfer_date ? format(new Date(row.transfer_date), 'MMM d, yyyy') : '—' },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: '', cell: row => row.status === 'pending' ? (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={e => { e.stopPropagation(); approveTransfer.mutate(row); }}><Check className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={e => { e.stopPropagation(); rejectTransfer.mutate(row); }}><X className="w-3.5 h-3.5" /></Button>
      </div>
    ) : null },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Transfers" description="Transfer inventory between warehouses" actions={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />New Transfer</Button>} />
      <DataTable columns={columns} data={transfers} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Transfer Request</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createTransfer.mutate(form); }} className="space-y-4">
            <div>
              <Label>Product *</Label>
              <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{products.filter(p => p.status === 'active').map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Quantity *</Label><Input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} required /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Source Warehouse *</Label>
                <Select value={form.source_warehouse_id} onValueChange={v => setForm({ ...form, source_warehouse_id: v })}>
                  <SelectTrigger><SelectValue placeholder="From" /></SelectTrigger>
                  <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Destination *</Label>
                <Select value={form.destination_warehouse_id} onValueChange={v => setForm({ ...form, destination_warehouse_id: v })}>
                  <SelectTrigger><SelectValue placeholder="To" /></SelectTrigger>
                  <SelectContent>{warehouses.filter(w => w.id !== form.source_warehouse_id).map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Reason *</Label><Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} required /></div>
            <div><Label>Date</Label><Input type="date" value={form.transfer_date} onChange={e => setForm({ ...form, transfer_date: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={createTransfer.isPending}>{createTransfer.isPending ? 'Submitting...' : 'Submit Request'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}