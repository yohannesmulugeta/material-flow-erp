import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Printer, Package, Check, Truck, Hand } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import StatusBadge from '@/components/ui/StatusBadge';
import { printReleaseSlip } from '@/components/warehouse/ReleaseSlip';
import { logActivity } from '@/lib/activityLogger';
import { toast } from '@/components/ui/use-toast';
import { format } from 'date-fns';

const ADMIN = ['super_admin', 'admin', 'manager'];

function parseItems(r) {
  try { return typeof r.items === 'string' ? JSON.parse(r.items) : (r.items || []); } catch { return []; }
}

export default function WarehouseReleases() {
  const qc = useQueryClient();
  const { role, user } = useAuth();
  const isAdmin = ADMIN.includes(role);
  const [pickOpen, setPickOpen] = useState(false);
  const [active, setActive] = useState(null);
  const [pickForm, setPickForm] = useState({ released_by: '', release_date: format(new Date(), 'yyyy-MM-dd'), note: '', item_condition: 'Good' });

  const { data: releases = [], isLoading } = useQuery({ queryKey: ['warehouse-releases'], queryFn: () => base44.entities.WarehouseRelease.list('-created_date') });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });

  const active_ = releases.filter(r => !r.archived);
  const pendingPick = active_.filter(r => r.pick_status === 'pending' || r.pick_status === 'picking');
  const picked = active_.filter(r => r.pick_status === 'picked' && r.status === 'pending');
  const completed = active_.filter(r => r.status === 'approved');

  // Warehouse staff records the pick
  const recordPick = useMutation({
    mutationFn: async () => {
      await base44.entities.WarehouseRelease.update(active.id, {
        pick_status: 'picked',
        released_by: pickForm.released_by,
        release_date: pickForm.release_date,
        note: pickForm.note,
        item_condition: pickForm.item_condition,
      });
      await base44.entities.Sale.update(active.sale_id, { workflow_status: 'released' });
      await logActivity({ module: 'WarehouseRelease', action: 'picked', entityType: 'WarehouseRelease', entityId: active.id, description: `Items picked for ${active.invoice_number} by ${pickForm.released_by}` });
    },
    onSuccess: () => { qc.invalidateQueries(); setPickOpen(false); setActive(null); },
    onError: (err) => {
      console.error('Record pick failed:', err);
      toast({ variant: 'destructive', title: 'Could not record pick', description: 'Please try again or contact admin.' });
    },
  });

  // Admin final approval → deduct stock from reserved + total, complete the sale
  const approve = useMutation({
    mutationFn: async (r) => {
      const items = parseItems(r);
      for (const item of items) {
        const inv = inventory.find(i => i.product_id === item.product_id && i.warehouse_id === r.warehouse_id);
        if (inv) {
          const newQty = Math.max(0, (inv.quantity || 0) - item.quantity);
          const newReserved = Math.max(0, (inv.reserved_quantity || 0) - item.quantity);
          await base44.entities.InventoryStock.update(inv.id, {
            quantity: newQty,
            reserved_quantity: newReserved,
            total_value_etb: newQty * (inv.avg_cost_etb || 0),
          });
          await base44.entities.StockTransaction.create({
            product_id: item.product_id, product_name: item.product_name,
            warehouse_id: r.warehouse_id, warehouse_name: r.warehouse_name,
            type: 'stock_out', reason: 'sale', quantity: item.quantity,
            unit_cost_etb: item.unit_cost, reference_id: r.sale_id, reference_type: 'Sale',
          });
        }
      }
      await base44.entities.WarehouseRelease.update(r.id, { status: 'approved', approved_by: user?.full_name || user?.email, approved_at: new Date().toISOString() });
      await base44.entities.Sale.update(r.sale_id, { workflow_status: 'completed', status: 'completed', completed_at: new Date().toISOString() });
      await logActivity({ module: 'WarehouseRelease', action: 'approved', entityType: 'WarehouseRelease', entityId: r.id, description: `Final approval & stock deducted for ${r.invoice_number}` });
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (err) => {
      console.error('Release approval failed:', err);
      toast({ variant: 'destructive', title: 'Approval failed', description: 'Please try again or contact admin.' });
    },
  });

  const reject = useMutation({
    mutationFn: async (r) => {
      // release the reservation back
      const items = parseItems(r);
      for (const item of items) {
        const inv = inventory.find(i => i.product_id === item.product_id && i.warehouse_id === r.warehouse_id);
        if (inv) await base44.entities.InventoryStock.update(inv.id, { reserved_quantity: Math.max(0, (inv.reserved_quantity || 0) - item.quantity) });
      }
      await base44.entities.WarehouseRelease.update(r.id, { status: 'rejected' });
      await base44.entities.Sale.update(r.sale_id, { workflow_status: 'cancelled', status: 'cancelled' });
      await logActivity({ module: 'WarehouseRelease', action: 'rejected', entityType: 'WarehouseRelease', entityId: r.id, description: `Release rejected for ${r.invoice_number}, reservation released` });
    },
    onSuccess: () => qc.invalidateQueries(),
    onError: (err) => {
      console.error('Release rejection failed:', err);
      toast({ variant: 'destructive', title: 'Rejection failed', description: 'Please try again or contact admin.' });
    },
  });

  function openPick(r) {
    setActive(r);
    setPickForm({ released_by: user?.full_name || '', release_date: format(new Date(), 'yyyy-MM-dd'), note: '', item_condition: 'Good' });
    setPickOpen(true);
  }

  const ReleaseCard = ({ r, actions }) => {
    const items = parseItems(r);
    return (
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className="font-mono font-semibold">{r.invoice_number}</p>
            <p className="text-sm text-muted-foreground">{r.customer_name} · {r.warehouse_name}</p>
          </div>
          <div className="flex gap-1.5">
            <Badge variant="outline" className="capitalize">{r.pick_status}</Badge>
            <StatusBadge status={r.status} />
          </div>
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40"><tr><th className="text-left px-3 py-1.5 text-xs">Item</th><th className="text-right px-3 py-1.5 text-xs">Qty</th></tr></thead>
            <tbody className="divide-y divide-border/50">
              {items.map((it, i) => (
                <tr key={i}><td className="px-3 py-1.5">{it.product_name}{it.variant_name ? ` — ${it.variant_name}` : ''}</td><td className="px-3 py-1.5 text-right tabular-nums font-medium">{it.quantity}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        {r.released_by && <p className="text-xs text-muted-foreground">Picked by {r.released_by} · {r.item_condition} {r.note ? `· ${r.note}` : ''}</p>}
        <div className="flex gap-2 flex-wrap">{actions}</div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Warehouse Release" description="Pick, print release slips, and release stock for sales" />

      <Tabs defaultValue="pick">
        <TabsList className="w-full flex-wrap">
          <TabsTrigger value="pick" className="gap-1.5"><Hand className="w-3.5 h-3.5" />To Pick {pendingPick.length > 0 && <Badge className="h-4 px-1.5 text-[10px]">{pendingPick.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="approve" className="gap-1.5"><Check className="w-3.5 h-3.5" />Awaiting Approval {picked.length > 0 && <Badge className="h-4 px-1.5 text-[10px]">{picked.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="done" className="gap-1.5"><Truck className="w-3.5 h-3.5" />Completed</TabsTrigger>
        </TabsList>

        <TabsContent value="pick" className="space-y-3">
          {pendingPick.length === 0 ? <Empty text="No items waiting to be picked" /> :
            pendingPick.map(r => <ReleaseCard key={r.id} r={r} actions={
              <>
                <Button size="sm" onClick={() => openPick(r)}><Hand className="w-3.5 h-3.5 mr-1.5" />Record Pick</Button>
                <Button size="sm" variant="outline" onClick={() => printReleaseSlip(r, parseItems(r))}><Printer className="w-3.5 h-3.5 mr-1.5" />Print Slip</Button>
              </>
            } />)}
        </TabsContent>

        <TabsContent value="approve" className="space-y-3">
          {picked.length === 0 ? <Empty text="No releases awaiting admin approval" /> :
            picked.map(r => <ReleaseCard key={r.id} r={r} actions={
              <>
                <Button size="sm" variant="outline" onClick={() => printReleaseSlip(r, parseItems(r))}><Printer className="w-3.5 h-3.5 mr-1.5" />Print Slip</Button>
                {isAdmin ? (
                  <>
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => approve.mutate(r)} disabled={approve.isPending}><Check className="w-3.5 h-3.5 mr-1.5" />Approve & Deduct Stock</Button>
                    <Button size="sm" variant="outline" className="text-destructive" onClick={() => { if (window.confirm('Reject this release? Reserved stock will be returned.')) reject.mutate(r); }}>Reject</Button>
                  </>
                ) : <Badge variant="outline">Waiting for admin approval</Badge>}
              </>
            } />)}
        </TabsContent>

        <TabsContent value="done" className="space-y-3">
          {completed.length === 0 ? <Empty text="No completed releases yet" /> :
            completed.slice(0, 30).map(r => <ReleaseCard key={r.id} r={r} actions={
              <Button size="sm" variant="outline" onClick={() => printReleaseSlip(r, parseItems(r))}><Printer className="w-3.5 h-3.5 mr-1.5" />Print Slip</Button>
            } />)}
        </TabsContent>
      </Tabs>

      {/* Pick dialog */}
      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Item Pick — {active?.invoice_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Released By (your name) *</Label><Input value={pickForm.released_by} onChange={e => setPickForm({ ...pickForm, released_by: e.target.value })} /></div>
            <div><Label>Release Date</Label><Input type="date" value={pickForm.release_date} onChange={e => setPickForm({ ...pickForm, release_date: e.target.value })} /></div>
            <div><Label>Condition of Items</Label><Input value={pickForm.item_condition} onChange={e => setPickForm({ ...pickForm, item_condition: e.target.value })} placeholder="Good / Damaged / Partial" /></div>
            <div><Label>Note</Label><Textarea value={pickForm.note} onChange={e => setPickForm({ ...pickForm, note: e.target.value })} /></div>
            <Button className="w-full" onClick={() => recordPick.mutate()} disabled={recordPick.isPending || !pickForm.released_by}>
              {recordPick.isPending ? 'Saving…' : 'Confirm Pick → Send for Approval'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="flex flex-col items-center py-16 text-center bg-card border border-border rounded-2xl">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4"><Package className="w-7 h-7 text-muted-foreground/40" /></div>
      <p className="font-semibold mb-1">{text}</p>
      <p className="text-sm text-muted-foreground">New sales reserve stock and appear here for release.</p>
    </div>
  );
}
