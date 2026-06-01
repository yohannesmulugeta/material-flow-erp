import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Package } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import { logActivity } from '@/lib/activityLogger';

export default function ContainerDetail({ container, onBack }) {
  const qc = useQueryClient();
  const [addItem, setAddItem] = useState(false);
  const [itemForm, setItemForm] = useState({ product_id: '', quantity: 0, unit_cost_usd: 0 });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['container-items', container.id],
    queryFn: () => base44.entities.ContainerItem.filter({ container_id: container.id })
  });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.list() });

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  const totalProductCostUsd = items.reduce((s, x) => s + (x.total_cost_usd || 0), 0);
  const totalOverheadEtb = (container.freight_cost || 0) + (container.insurance_cost || 0) +
    (container.customs_cost || 0) + (container.transport_cost || 0) + (container.loading_cost || 0) +
    (container.unloading_cost || 0) + (container.other_costs || 0);
  const totalProductCostEtb = totalProductCostUsd * (container.exchange_rate || 0);
  const totalImportCost = totalProductCostEtb + totalOverheadEtb;

  const saveItem = useMutation({
    mutationFn: async (data) => {
      const product = products.find(p => p.id === data.product_id);
      const totalCostUsd = data.quantity * data.unit_cost_usd;
      const totalItems = items.reduce((s, x) => s + (x.total_cost_usd || 0), 0) + totalCostUsd;
      const totalProductsEtb = totalItems * (container.exchange_rate || 0);
      const shareRatio = totalProductsEtb > 0 ? (totalCostUsd * (container.exchange_rate || 0)) / totalProductsEtb : 0;
      const landedCostTotal = (totalCostUsd * (container.exchange_rate || 0)) + (totalOverheadEtb * shareRatio);
      const landedCostPerUnit = data.quantity > 0 ? landedCostTotal / data.quantity : 0;

      await base44.entities.ContainerItem.create({
        container_id: container.id,
        product_id: data.product_id,
        product_name: product?.name || '',
        quantity: data.quantity,
        unit_cost_usd: data.unit_cost_usd,
        total_cost_usd: totalCostUsd,
        landed_cost_per_unit_etb: landedCostPerUnit,
        total_landed_cost_etb: landedCostTotal,
      });
      await base44.entities.Container.update(container.id, { total_product_cost_usd: totalItems });
      await logActivity({ module: 'Container', action: 'item_added', entityType: 'ContainerItem', description: `Added ${product?.name} to container ${container.container_number}` });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['container-items'] }); setAddItem(false); setItemForm({ product_id: '', quantity: 0, unit_cost_usd: 0 }); }
  });

  const receiveContainer = useMutation({
    mutationFn: async () => {
      const wh = warehouses.find(w => w.id === container.receiving_warehouse_id);
      for (const item of items) {
        // Create stock transaction
        await base44.entities.StockTransaction.create({
          product_id: item.product_id, product_name: item.product_name,
          warehouse_id: container.receiving_warehouse_id, warehouse_name: wh?.name || '',
          type: 'stock_in', reason: 'container_receiving', quantity: item.quantity,
          unit_cost_etb: item.landed_cost_per_unit_etb || 0,
          reference_id: container.id, reference_type: 'Container',
        });
        // Update inventory
        const existing = await base44.entities.InventoryStock.filter({
          product_id: item.product_id, warehouse_id: container.receiving_warehouse_id
        });
        if (existing.length > 0) {
          const inv = existing[0];
          const newQty = (inv.quantity || 0) + item.quantity;
          const newTotalValue = (inv.total_value_etb || 0) + (item.total_landed_cost_etb || 0);
          const newAvgCost = newQty > 0 ? newTotalValue / newQty : 0;
          await base44.entities.InventoryStock.update(inv.id, { quantity: newQty, avg_cost_etb: newAvgCost, total_value_etb: newTotalValue });
        } else {
          await base44.entities.InventoryStock.create({
            product_id: item.product_id, product_name: item.product_name,
            warehouse_id: container.receiving_warehouse_id, warehouse_name: wh?.name || '',
            quantity: item.quantity, avg_cost_etb: item.landed_cost_per_unit_etb || 0,
            total_value_etb: item.total_landed_cost_etb || 0,
          });
        }
      }
      const totalEtb = totalImportCost;
      await base44.entities.Container.update(container.id, { status: 'received', total_import_cost_etb: totalEtb });
      await logActivity({ module: 'Container', action: 'received', entityType: 'Container', entityId: container.id, description: `Received container ${container.container_number}` });
    },
    onSuccess: () => { qc.invalidateQueries(); onBack(); }
  });

  const columns = [
    { header: 'Product', accessorKey: 'product_name', cell: row => <span className="font-medium">{row.product_name}</span> },
    { header: 'Qty', accessorKey: 'quantity' },
    { header: 'Unit Cost (USD)', cell: row => `$${fmt(row.unit_cost_usd)}` },
    { header: 'Total (USD)', cell: row => `$${fmt(row.total_cost_usd)}` },
    { header: 'Landed Cost/Unit (ETB)', cell: row => fmt(row.landed_cost_per_unit_etb) },
    { header: 'Total Landed (ETB)', cell: row => fmt(row.total_landed_cost_etb) },
  ];

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="mb-2"><ArrowLeft className="w-4 h-4 mr-2" />Back to Containers</Button>
      <PageHeader
        title={`Container: ${container.container_number}`}
        description={`Supplier: ${container.supplier_name || '—'} · Exchange Rate: 1 USD = ${fmt(container.exchange_rate)} ETB`}
        actions={
          <div className="flex gap-2">
            <StatusBadge status={container.status} />
            {container.status !== 'received' && container.status !== 'closed' && items.length > 0 && container.receiving_warehouse_id && (
              <Button onClick={() => receiveContainer.mutate()} disabled={receiveContainer.isPending}>
                {receiveContainer.isPending ? 'Receiving...' : 'Receive Container'}
              </Button>
            )}
          </div>
        }
      />

      {/* Cost Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Product Cost (USD)</p>
          <p className="text-lg font-bold">${fmt(totalProductCostUsd)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Product Cost (ETB)</p>
          <p className="text-lg font-bold">ETB {fmt(totalProductCostEtb)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Overhead Costs (ETB)</p>
          <p className="text-lg font-bold">ETB {fmt(totalOverheadEtb)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4 bg-primary/5">
          <p className="text-xs text-muted-foreground">Total Import Cost</p>
          <p className="text-lg font-bold text-primary">ETB {fmt(totalImportCost)}</p>
        </div>
      </div>

      {/* Items */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Container Items</h3>
        {container.status !== 'received' && container.status !== 'closed' && (
          <Button size="sm" variant="outline" onClick={() => setAddItem(true)}><Plus className="w-3.5 h-3.5 mr-1" />Add Item</Button>
        )}
      </div>
      <DataTable columns={columns} data={items} isLoading={isLoading} searchable={false} />

      <Dialog open={addItem} onOpenChange={setAddItem}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Item to Container</DialogTitle></DialogHeader>
          <form onSubmit={e => { e.preventDefault(); saveItem.mutate(itemForm); }} className="space-y-4">
            <div>
              <Label>Product *</Label>
              <Select value={itemForm.product_id} onValueChange={v => setItemForm({ ...itemForm, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.filter(p => p.status === 'active').map(p => <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantity *</Label><Input type="number" value={itemForm.quantity} onChange={e => setItemForm({ ...itemForm, quantity: Number(e.target.value) })} required /></div>
              <div><Label>Unit Cost (USD) *</Label><Input type="number" step="0.01" value={itemForm.unit_cost_usd} onChange={e => setItemForm({ ...itemForm, unit_cost_usd: Number(e.target.value) })} required /></div>
            </div>
            <Button type="submit" className="w-full" disabled={saveItem.isPending}>{saveItem.isPending ? 'Adding...' : 'Add Item'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}