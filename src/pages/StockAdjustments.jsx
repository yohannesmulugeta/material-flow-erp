import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { logActivity } from '@/lib/activityLogger';

export default function StockAdjustments() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ product_id: '', warehouse_id: '', actual_quantity: 0, reason: '' });

  const { data: adjustments = [], isLoading } = useQuery({ queryKey: ['adjustments-all'], queryFn: () => base44.entities.StockAdjustment.list('-created_date') });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.filter({ status: 'active' }) });

  const warehouseInventory = inventory.filter(i => i.warehouse_id === form.warehouse_id);
  const selectedInv = warehouseInventory.find(i => i.product_id === form.product_id);
  const systemQty = selectedInv?.quantity || (editing?.system_quantity || 0);
  const difference = form.actual_quantity - systemQty;

  const submit = useMutation({
    mutationFn: async (data) => {
      const prod = products.find(p => p.id === data.product_id);
      const wh = warehouses.find(w => w.id === data.warehouse_id);
      const inv = inventory.find(i => i.product_id === data.product_id && i.warehouse_id === data.warehouse_id);
      const sysQty = inv?.quantity || 0;
      const diff = data.actual_quantity - sysQty;

      const payload = {
        product_id: data.product_id,
        product_name: prod?.name || editing?.product_name || '',
        warehouse_id: data.warehouse_id,
        warehouse_name: wh?.name || editing?.warehouse_name || '',
        system_quantity: sysQty,
        actual_quantity: data.actual_quantity,
        difference: diff,
        reason: data.reason,
        status: 'pending',
      };

      if (editing) {
        await base44.entities.StockAdjustment.update(editing.id, payload);
        await logActivity({ module: 'StockAdjustment', action: 'updated', entityType: 'StockAdjustment', entityId: editing.id, description: `Updated adjustment: ${payload.product_name} → ${data.actual_quantity}` });
      } else {
        await base44.entities.StockAdjustment.create(payload);
        await logActivity({ module: 'StockAdjustment', action: 'created', entityType: 'StockAdjustment', description: `Adjustment request: ${payload.product_name} → ${data.actual_quantity} (diff: ${diff >= 0 ? '+' : ''}${diff})` });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries();
      setOpen(false);
      setEditing(null);
      setForm({ product_id: '', warehouse_id: '', actual_quantity: 0, reason: '' });
    },
    onError: (err) => alert(err.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ product_id: '', warehouse_id: '', actual_quantity: 0, reason: '' });
    setOpen(true);
  };

  const openEdit = (adj) => {
    if (adj.status !== 'pending') { alert('Only pending adjustments can be edited.'); return; }
    setEditing(adj);
    setForm({
      product_id: adj.product_id,
      warehouse_id: adj.warehouse_id,
      actual_quantity: adj.actual_quantity,
      reason: adj.reason || '',
    });
    setOpen(true);
  };

  const columns = [
    { header: 'Product', accessorKey: 'product_name', cell: row => <span className="font-medium">{row.product_name}</span> },
    { header: 'Warehouse', accessorKey: 'warehouse_name' },
    { header: 'System Qty', accessorKey: 'system_quantity', cell: row => <span className="tabular-nums">{row.system_quantity}</span> },
    { header: 'Actual Qty', accessorKey: 'actual_quantity', cell: row => <span className="tabular-nums font-semibold">{row.actual_quantity}</span> },
    { header: 'Difference', cell: row => {
      const d = row.difference || 0;
      return <span className={`tabular-nums font-semibold ${d >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{d >= 0 ? '+' : ''}{d}</span>;
    }},
    { header: 'Reason', accessorKey: 'reason' },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: '', cell: row => row.status === 'pending' ? (
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); openEdit(row); }}>
        <Pencil className="w-3.5 h-3.5" />
      </Button>
    ) : null },
  ];

  const currentSystemQty = editing
    ? (inventory.find(i => i.product_id === form.product_id && i.warehouse_id === form.warehouse_id)?.quantity ?? editing.system_quantity)
    : (selectedInv?.quantity ?? 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Stock Adjustments" description="Physical count and inventory corrections"
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />New Adjustment</Button>}
      />
      <DataTable columns={columns} data={adjustments} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) { setEditing(null); setForm({ product_id: '', warehouse_id: '', actual_quantity: 0, reason: '' }); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Adjustment' : 'New Stock Adjustment'}</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); submit.mutate(form); }} className="space-y-4">
            <div>
              <Label>Warehouse *</Label>
              <Select value={form.warehouse_id} onValueChange={v => setForm({ ...form, warehouse_id: v, product_id: '' })}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Product *</Label>
              <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {(form.warehouse_id ? warehouseInventory : inventory).map(i => (
                    <SelectItem key={i.product_id} value={i.product_id}>{i.product_name} (System: {i.quantity})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {form.product_id && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">System Quantity:</span><span className="font-semibold">{currentSystemQty}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Difference:</span>
                  <span className={`font-semibold ${(form.actual_quantity - currentSystemQty) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {(form.actual_quantity - currentSystemQty) >= 0 ? '+' : ''}{form.actual_quantity - currentSystemQty}
                  </span>
                </div>
              </div>
            )}

            <div>
              <Label>Actual (Physical) Quantity *</Label>
              <Input type="number" min="0" value={form.actual_quantity} onChange={e => setForm({ ...form, actual_quantity: Number(e.target.value) })} required />
            </div>
            <div>
              <Label>Reason *</Label>
              <Textarea value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="Why is this adjustment needed?" required />
            </div>
            <p className="text-xs text-muted-foreground">This adjustment requires admin approval before stock is updated.</p>
            <Button type="submit" className="w-full" disabled={submit.isPending || !form.product_id}>
              {submit.isPending ? 'Saving...' : editing ? 'Update Adjustment' : 'Submit for Approval'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
