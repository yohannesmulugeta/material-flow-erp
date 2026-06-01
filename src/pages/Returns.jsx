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

export default function Returns() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sale_id: '', product_id: '', quantity: 0, reason: 'defective', reason_notes: '' });

  const { data: returns = [], isLoading } = useQuery({ queryKey: ['returns'], queryFn: () => base44.entities.SalesReturn.list('-created_date') });
  const { data: sales = [] } = useQuery({ queryKey: ['sales'], queryFn: () => base44.entities.Sale.filter({ status: 'completed' }, '-created_date', 50) });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });

  const selectedSale = sales.find(s => s.id === form.sale_id);

  const createReturn = useMutation({
    mutationFn: async (data) => {
      const sale = sales.find(s => s.id === data.sale_id);
      const saleItem = (sale?.items || []).find(i => i.product_id === data.product_id);
      await base44.entities.SalesReturn.create({
        ...data,
        invoice_number: sale?.invoice_number || '',
        customer_id: sale?.customer_id || '',
        customer_name: sale?.customer_name || '',
        product_name: saleItem?.product_name || '',
        warehouse_id: sale?.warehouse_id || '',
        unit_cost: saleItem?.unit_cost || 0,
        status: 'pending',
      });
      await logActivity({ module: 'Return', action: 'created', entityType: 'SalesReturn', description: `Return request: ${saleItem?.product_name} from ${sale?.invoice_number}` });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['returns'] }); setOpen(false); }
  });

  const approve = useMutation({
    mutationFn: async (ret) => {
      const inv = inventory.find(i => i.product_id === ret.product_id && i.warehouse_id === ret.warehouse_id);
      if (inv) {
        const newQty = (inv.quantity || 0) + ret.quantity;
        await base44.entities.InventoryStock.update(inv.id, { quantity: newQty, total_value_etb: newQty * (inv.avg_cost_etb || 0) });
      }
      await base44.entities.StockTransaction.create({
        product_id: ret.product_id, product_name: ret.product_name,
        warehouse_id: ret.warehouse_id, type: 'stock_in', reason: 'return',
        quantity: ret.quantity, reference_id: ret.id, reference_type: 'SalesReturn',
      });
      await base44.entities.SalesReturn.update(ret.id, { status: 'approved' });
      await logActivity({ module: 'Return', action: 'approved', entityType: 'SalesReturn', entityId: ret.id, description: `Approved return: ${ret.product_name}` });
    },
    onSuccess: () => qc.invalidateQueries()
  });

  const reject = useMutation({
    mutationFn: async (ret) => { await base44.entities.SalesReturn.update(ret.id, { status: 'rejected' }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['returns'] })
  });

  const columns = [
    { header: 'Invoice', accessorKey: 'invoice_number', cell: row => <span className="font-mono">{row.invoice_number}</span> },
    { header: 'Product', accessorKey: 'product_name', cell: row => <span className="font-medium">{row.product_name}</span> },
    { header: 'Customer', accessorKey: 'customer_name' },
    { header: 'Qty', accessorKey: 'quantity' },
    { header: 'Reason', cell: row => (row.reason || '').replace(/_/g, ' ') },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: '', cell: row => row.status === 'pending' ? (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={e => { e.stopPropagation(); approve.mutate(row); }}><Check className="w-3.5 h-3.5" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={e => { e.stopPropagation(); reject.mutate(row); }}><X className="w-3.5 h-3.5" /></Button>
      </div>
    ) : null },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Sales Returns" description="Manage product returns" actions={<Button onClick={() => { setForm({ sale_id: '', product_id: '', quantity: 0, reason: 'defective', reason_notes: '' }); setOpen(true); }}><Plus className="w-4 h-4 mr-2" />New Return</Button>} />
      <DataTable columns={columns} data={returns} isLoading={isLoading} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Return</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); createReturn.mutate(form); }} className="space-y-4">
            <div>
              <Label>Invoice *</Label>
              <Select value={form.sale_id} onValueChange={v => setForm({ ...form, sale_id: v, product_id: '' })}>
                <SelectTrigger><SelectValue placeholder="Select invoice" /></SelectTrigger>
                <SelectContent>{sales.map(s => <SelectItem key={s.id} value={s.id}>{s.invoice_number} — {s.customer_name || 'Walk-in'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {selectedSale && (
              <div>
                <Label>Product *</Label>
                <Select value={form.product_id} onValueChange={v => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{(selectedSale.items || []).map(i => <SelectItem key={i.product_id} value={i.product_id}>{i.product_name} (Sold: {i.quantity})</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Quantity *</Label><Input type="number" min="1" value={form.quantity} onChange={e => setForm({ ...form, quantity: Number(e.target.value) })} required /></div>
            <div>
              <Label>Reason *</Label>
              <Select value={form.reason} onValueChange={v => setForm({ ...form, reason: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="defective">Defective</SelectItem>
                  <SelectItem value="wrong_product">Wrong Product</SelectItem>
                  <SelectItem value="customer_complaint">Customer Complaint</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea value={form.reason_notes} onChange={e => setForm({ ...form, reason_notes: e.target.value })} /></div>
            <Button type="submit" className="w-full" disabled={createReturn.isPending}>{createReturn.isPending ? 'Submitting...' : 'Submit Return'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}