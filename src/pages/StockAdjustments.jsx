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

export default function StockAdjustments() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: '', warehouse_id: '', actual_quantity: 0, reason: '' });

  const { data: adjustments = [], isLoading } = useQuery({ queryKey: ['adjustments-all'], queryFn: () => base44.entities.StockAdjustment.list('-created_date') });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.filter({ status: 'active' }) });

  const warehouseInventory = inventory.filter(i => i.warehouse_id === form.warehouse_id);
  const selectedInv = warehouseInventory.find(i => i.product_id === form.product_id);
  const systemQty = selectedInv?.quantity || 0;
  const difference = form.actual_quantity - systemQty;

  const submit = useMutation({
    mutationFn: async (data) => {
      const prod = products.find(p => p.id === data.product_id);
      const wh = warehouses.find(w => w.id === data.warehouse_id);
      await base44.entities.StockAdjustment.create({
        product_id: data.product_id,
        product_name: prod?.name || '',
        warehouse_id: data.warehouse_id,
        warehouse_name: wh?.name || '',
        system_quantity: systemQty,
        actual_quantity: data.actual_quantity,
        difference,
        reason: data.reason,
        status: 'pending',
      });
      await logActivity({ module: 'StockAdjustment', action: 'created', entityType: 'StockAdjustment', description: `Adjustment request: ${prod?.name} → ${data.actual_quantity} (diff: ${difference >= 0 ? '+' : ''}${difference})` });
    },
    onSuccess: () => { qc.invalidateQueries(); setOpen(false); setForm({ product_id: '', warehouse_id: '', actual_quantity: 0, reason: '' }); }
  });

  const columns = [
    { header: 'Product', accessorKey: 'product_name', cell: row => <span className="font-medium">{row.product_name}</span> },
    { header: 'Warehouse', accessorKey: 'warehouse_name' },
    { header: 'System Qty', accessorKey: 'system_quantity' },
    { header: 'Actual Qty', accessorKey: 'actual_quantity' },
    { header: 'Difference', cell: row => {
      const d = row.difference || 0;
      return <span className={d >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>{d >= 0 ? '+' : ''}{d}</span>;
    }},
    { header: 'Reason', accessorKey: 'reason' },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Stock Adjustments" description="Physical count and inventory corrections" actions={<Button onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-2" />New Adjustment</Button>} />
      <DataTable columns={columns} data={adjustments} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Stock Adjustment</DialogTitle></DialogHeader>
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
                  {warehouseInventory.map(i => (
                    <SelectItem key={i.product_id} value={i.product_id}>{i.product_name} (System: {i.quantity})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.product_id && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">System Quantity:</span><span className="font-semibold">{systemQty}</span></div>
                {form.actual_quantity > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Difference:</span>
                    <span className={`font-semibold ${difference >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{difference >= 0 ? '+' : ''}{difference}</span>
                  </div>
                )}
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
            <p className="text-xs text-muted-foreground">This adjustment will be sent for admin approval before being applied.</p>
            <Button type="submit" className="w-full" disabled={submit.isPending || !form.product_id}>{submit.isPending ? 'Submitting...' : 'Submit for Approval'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}