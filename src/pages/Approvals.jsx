import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44, supabase } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Check, X, ArrowLeftRight, Undo2, AlertTriangle, SlidersHorizontal, CreditCard } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { logActivity } from '@/lib/activityLogger';
import { toast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

function ApprovalRow({ label, detail, date, onApprove, onReject, loading }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
        {date && <p className="text-xs text-muted-foreground">{format(new Date(date), 'MMM d, yyyy')}</p>}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 h-8" onClick={onApprove} disabled={loading}>
          <Check className="w-3.5 h-3.5 mr-1" />Approve
        </Button>
        <Button size="sm" variant="outline" className="text-destructive border-destructive/20 hover:bg-destructive/5 h-8" onClick={onReject} disabled={loading}>
          <X className="w-3.5 h-3.5 mr-1" />Reject
        </Button>
      </div>
    </div>
  );
}

export default function Approvals() {
  const qc = useQueryClient();

  const { data: transfers = [], isLoading: lt } = useQuery({ queryKey: ['transfers'], queryFn: () => base44.entities.Transfer.filter({ status: 'pending' }) });
  const { data: returns = [], isLoading: lr } = useQuery({ queryKey: ['returns'], queryFn: () => base44.entities.SalesReturn.filter({ status: 'pending' }) });
  const { data: damages = [], isLoading: ld } = useQuery({ queryKey: ['damages'], queryFn: () => base44.entities.DamageRecord.filter({ status: 'pending' }) });
  const { data: adjustments = [], isLoading: la } = useQuery({ queryKey: ['adjustments'], queryFn: () => base44.entities.StockAdjustment.filter({ status: 'pending' }) });
  const { data: paymentRequests = [] } = useQuery({ queryKey: ['payment-approvals'], queryFn: () => base44.entities.ApprovalRequest.filter({ status: 'pending' }) });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });

  const pendingPaymentReqs = paymentRequests.filter(r => r.type === 'payment_edit' || r.type === 'payment_delete');
  const totalPending = transfers.length + returns.length + damages.length + adjustments.length + pendingPaymentReqs.length;

  // Transfer approval
  const approveTransfer = useMutation({
    mutationFn: async (transfer) => {
      const srcInv = inventory.find(i => i.product_id === transfer.product_id && i.warehouse_id === transfer.source_warehouse_id);
      if (!srcInv || srcInv.quantity < transfer.quantity) throw new Error('Insufficient stock');
      const newSrcQty = srcInv.quantity - transfer.quantity;
      await base44.entities.InventoryStock.update(srcInv.id, { quantity: newSrcQty, total_value_etb: newSrcQty * (srcInv.avg_cost_etb || 0) });
      const destInv = inventory.find(i => i.product_id === transfer.product_id && i.warehouse_id === transfer.destination_warehouse_id);
      if (destInv) {
        const newDestQty = (destInv.quantity || 0) + transfer.quantity;
        await base44.entities.InventoryStock.update(destInv.id, { quantity: newDestQty, total_value_etb: newDestQty * (srcInv.avg_cost_etb || 0) });
      } else {
        await base44.entities.InventoryStock.create({
          product_id: transfer.product_id, product_name: transfer.product_name,
          warehouse_id: transfer.destination_warehouse_id, warehouse_name: transfer.destination_warehouse_name,
          quantity: transfer.quantity, avg_cost_etb: srcInv.avg_cost_etb || 0,
          total_value_etb: transfer.quantity * (srcInv.avg_cost_etb || 0),
        });
      }
      await base44.entities.StockTransaction.create({ product_id: transfer.product_id, product_name: transfer.product_name, warehouse_id: transfer.source_warehouse_id, warehouse_name: transfer.source_warehouse_name, type: 'stock_out', reason: 'transfer_out', quantity: transfer.quantity, reference_id: transfer.id, reference_type: 'Transfer' });
      await base44.entities.StockTransaction.create({ product_id: transfer.product_id, product_name: transfer.product_name, warehouse_id: transfer.destination_warehouse_id, warehouse_name: transfer.destination_warehouse_name, type: 'stock_in', reason: 'transfer_in', quantity: transfer.quantity, reference_id: transfer.id, reference_type: 'Transfer' });
      await base44.entities.Transfer.update(transfer.id, { status: 'completed' });
      await logActivity({ module: 'Transfer', action: 'approved', entityType: 'Transfer', entityId: transfer.id, description: `Approved transfer: ${transfer.product_name} x${transfer.quantity}` });
    },
    onSuccess: () => qc.invalidateQueries()
  });

  const rejectTransfer = useMutation({
    mutationFn: async (t) => { await base44.entities.Transfer.update(t.id, { status: 'rejected' }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['transfers'] })
  });

  // Return approval
  const approveReturn = useMutation({
    mutationFn: async (ret) => {
      // Atomic, race-safe return approval in the database: adds returned stock
      // (creating the inventory row if missing), writes the stock_transaction,
      // and marks the return approved — all in one transaction with row locks
      // and a state guard. Replaces the browser read-modify-write.
      const { error } = await supabase.rpc('approve_return', { p_return_id: ret.id });
      if (error) throw error;
      // Audit log is not written by the RPC — keep it here (no duplication).
      await logActivity({ module: 'Return', action: 'approved', entityType: 'SalesReturn', entityId: ret.id, description: `Approved return: ${ret.product_name}` });
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (err) => {
      console.error('Return approval failed:', err);
      toast({ variant: 'destructive', title: 'Return approval failed', description: 'Please try again or contact admin.' });
    },
  });

  const rejectReturn = useMutation({
    mutationFn: async (r) => { await base44.entities.SalesReturn.update(r.id, { status: 'rejected' }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['returns'] })
  });

  // Damage approval
  const approveDamage = useMutation({
    mutationFn: async (record) => {
      const inv = inventory.find(i => i.product_id === record.product_id && i.warehouse_id === record.warehouse_id);
      if (inv) {
        const newQty = Math.max(0, (inv.quantity || 0) - record.quantity);
        await base44.entities.InventoryStock.update(inv.id, { quantity: newQty, total_value_etb: newQty * (inv.avg_cost_etb || 0) });
        await base44.entities.StockTransaction.create({ product_id: record.product_id, product_name: record.product_name, warehouse_id: record.warehouse_id, warehouse_name: record.warehouse_name, type: 'stock_out', reason: record.type, quantity: record.quantity, reference_id: record.id, reference_type: 'DamageRecord' });
      }
      await base44.entities.DamageRecord.update(record.id, { status: 'approved' });
      await logActivity({ module: 'Damage', action: 'approved', entityType: 'DamageRecord', entityId: record.id, description: `Approved ${record.type}: ${record.product_name}` });
    },
    onSuccess: () => qc.invalidateQueries()
  });

  const rejectDamage = useMutation({
    mutationFn: async (r) => { await base44.entities.DamageRecord.update(r.id, { status: 'rejected' }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['damages'] })
  });

  // Stock adjustment approval
  const approveAdjustment = useMutation({
    mutationFn: async (adj) => {
      const inv = inventory.find(i => i.product_id === adj.product_id && i.warehouse_id === adj.warehouse_id);
      if (inv) {
        const newQty = adj.actual_quantity;
        await base44.entities.InventoryStock.update(inv.id, { quantity: newQty, total_value_etb: newQty * (inv.avg_cost_etb || 0) });
        await base44.entities.StockTransaction.create({
          product_id: adj.product_id, product_name: adj.product_name,
          warehouse_id: adj.warehouse_id, warehouse_name: adj.warehouse_name,
          type: adj.difference >= 0 ? 'stock_in' : 'stock_out', reason: 'adjustment',
          quantity: Math.abs(adj.difference), reference_id: adj.id, reference_type: 'StockAdjustment',
        });
      }
      await base44.entities.StockAdjustment.update(adj.id, { status: 'approved' });
      await logActivity({ module: 'StockAdjustment', action: 'approved', entityType: 'StockAdjustment', entityId: adj.id, description: `Approved adjustment: ${adj.product_name} → ${adj.actual_quantity}` });
    },
    onSuccess: () => qc.invalidateQueries()
  });

  const rejectAdjustment = useMutation({
    mutationFn: async (a) => { await base44.entities.StockAdjustment.update(a.id, { status: 'rejected' }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['adjustments'] })
  });

  // Payment edit/delete approval
  const approvePaymentRequest = useMutation({
    mutationFn: async (req) => {
      if (req.type === 'payment_edit') {
        let payload = {};
        try { payload = JSON.parse(req.payload || '{}'); } catch {}
        await base44.entities.Payment.update(req.reference_id, payload);
        await logActivity({ module: 'Payment', action: 'edit_approved', entityType: 'Payment', entityId: req.reference_id, description: `Approved edit for: ${req.reference_label}` });
      } else if (req.type === 'payment_delete') {
        await base44.entities.Payment.update(req.reference_id, { status: 'cancelled', archived: true, archived_at: new Date().toISOString() });
        await logActivity({ module: 'Payment', action: 'delete_approved', entityType: 'Payment', entityId: req.reference_id, description: `Approved deletion of: ${req.reference_label}` });
      }
      await base44.entities.ApprovalRequest.update(req.id, { status: 'approved' });
    },
    onSuccess: () => qc.invalidateQueries()
  });

  const rejectPaymentRequest = useMutation({
    mutationFn: async (req) => {
      await base44.entities.ApprovalRequest.update(req.id, { status: 'rejected' });
      await logActivity({ module: 'Payment', action: 'request_rejected', entityType: 'ApprovalRequest', entityId: req.id, description: `Rejected ${req.type}: ${req.reference_label}` });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-approvals'] })
  });

  const tab = (label, icon, count) => (
    <TabsTrigger value={label} className="gap-1.5">
      {icon}
      <span className="hidden sm:inline">{label}</span>
      {count > 0 && <Badge className="h-4 px-1.5 text-[10px]">{count}</Badge>}
    </TabsTrigger>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Approval Center"
        description="Review and approve all pending requests"
        actions={totalPending > 0 ? <Badge className="text-sm px-3">{totalPending} Pending</Badge> : null}
      />

      <Tabs defaultValue="Transfers">
        <TabsList className="w-full flex-wrap">
          {tab('Transfers', <ArrowLeftRight className="w-3.5 h-3.5" />, transfers.length)}
          {tab('Returns', <Undo2 className="w-3.5 h-3.5" />, returns.length)}
          {tab('Damages', <AlertTriangle className="w-3.5 h-3.5" />, damages.length)}
          {tab('Adjustments', <SlidersHorizontal className="w-3.5 h-3.5" />, adjustments.length)}
          {tab('Payments', <CreditCard className="w-3.5 h-3.5" />, pendingPaymentReqs.length)}
        </TabsList>

        <TabsContent value="Transfers">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold mb-3">Pending Transfers</h3>
            {transfers.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No pending transfers</p> : transfers.map(t => (
              <ApprovalRow key={t.id}
                label={`${t.product_name} — ${t.quantity} units`}
                detail={`From: ${t.source_warehouse_name} → To: ${t.destination_warehouse_name}`}
                date={t.transfer_date || t.created_date}
                onApprove={() => approveTransfer.mutate(t)}
                onReject={() => rejectTransfer.mutate(t)}
                loading={approveTransfer.isPending || rejectTransfer.isPending}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="Returns">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold mb-3">Pending Returns</h3>
            {returns.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No pending returns</p> : returns.map(r => (
              <ApprovalRow key={r.id}
                label={`${r.product_name} — ${r.quantity} units`}
                detail={`Invoice: ${r.invoice_number} · Customer: ${r.customer_name} · Reason: ${(r.reason || '').replace(/_/g, ' ')}`}
                date={r.created_date}
                onApprove={() => approveReturn.mutate(r)}
                onReject={() => rejectReturn.mutate(r)}
                loading={approveReturn.isPending || rejectReturn.isPending}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="Damages">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold mb-3">Pending Damage & Loss</h3>
            {damages.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No pending damage records</p> : damages.map(d => (
              <ApprovalRow key={d.id}
                label={`${d.product_name} — ${d.quantity} units (${d.type})`}
                detail={`Warehouse: ${d.warehouse_name} · ${d.reason}`}
                date={d.created_date}
                onApprove={() => approveDamage.mutate(d)}
                onReject={() => rejectDamage.mutate(d)}
                loading={approveDamage.isPending || rejectDamage.isPending}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="Adjustments">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold mb-3">Pending Stock Adjustments</h3>
            {adjustments.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No pending adjustments</p> : adjustments.map(a => (
              <ApprovalRow key={a.id}
                label={`${a.product_name} — Adjust from ${a.system_quantity} to ${a.actual_quantity} (${a.difference >= 0 ? '+' : ''}${a.difference})`}
                detail={`Warehouse: ${a.warehouse_name} · Reason: ${a.reason}`}
                date={a.created_date}
                onApprove={() => approveAdjustment.mutate(a)}
                onReject={() => rejectAdjustment.mutate(a)}
                loading={approveAdjustment.isPending || rejectAdjustment.isPending}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="Payments">
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold mb-3">Pending Payment Requests</h3>
            {pendingPaymentReqs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No pending payment requests</p>
            ) : pendingPaymentReqs.map(req => (
              <ApprovalRow key={req.id}
                label={`${req.type === 'payment_edit' ? '✏️ Edit' : '🗑️ Delete'}: ${req.reference_label}`}
                detail={`Requested by: ${req.requested_by}${req.notes ? ` · ${req.notes}` : ''}`}
                date={req.created_date}
                onApprove={() => approvePaymentRequest.mutate(req)}
                onReject={() => rejectPaymentRequest.mutate(req)}
                loading={approvePaymentRequest.isPending || rejectPaymentRequest.isPending}
              />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}