import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { logActivity } from '@/lib/activityLogger';
import { format } from 'date-fns';

export default function NewSaleForm({ onBack }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    sale_type: 'cash', customer_id: '', warehouse_id: '', discount_pct: 0, tax: 0, notes: '',
    sale_date: format(new Date(), 'yyyy-MM-dd')
  });
  const [items, setItems] = useState([]);

  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => base44.entities.Customer.list() });
  const { data: warehouses = [] } = useQuery({ queryKey: ['warehouses'], queryFn: () => base44.entities.Warehouse.filter({ status: 'active' }) });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });

  const warehouseInventory = inventory.filter(i => i.warehouse_id === form.warehouse_id);

  const addItem = () => setItems([...items, { product_id: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const updateItem = (idx, field, value) => {
    const updated = [...items];
    // Auto-fill price from product default
    if (field === 'product_id') {
      const prod = products.find(p => p.id === value);
      updated[idx] = { ...updated[idx], product_id: value, unit_price: prod?.default_selling_price || 0 };
    } else {
      updated[idx] = { ...updated[idx], [field]: value };
    }
    setItems(updated);
  };

  const getProductInfo = (productId) => {
    const inv = warehouseInventory.find(i => i.product_id === productId);
    const prod = products.find(p => p.id === productId);
    return { inv, prod };
  };

  const subtotal = items.reduce((s, item) => s + (item.quantity * item.unit_price), 0);
  const discountAmt = subtotal * ((form.discount_pct || 0) / 100);
  const afterDiscount = subtotal - discountAmt;
  const taxAmt = afterDiscount * ((form.tax || 0) / 100);
  const total = afterDiscount + taxAmt;

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  const saveSale = useMutation({
    mutationFn: async () => {
      const customer = customers.find(c => c.id === form.customer_id);
      const warehouse = warehouses.find(w => w.id === form.warehouse_id);
      const invoiceNum = `INV-${Date.now().toString(36).toUpperCase()}`;

      let totalCost = 0;
      const saleItems = items.map(item => {
        const { inv, prod } = getProductInfo(item.product_id);
        const unitCost = inv?.avg_cost_etb || 0;
        const lineTotal = item.quantity * item.unit_price;
        const lineCost = item.quantity * unitCost;
        totalCost += lineCost;
        return {
          product_id: item.product_id, product_name: prod?.name || inv?.product_name || '',
          quantity: item.quantity, unit_price: item.unit_price, unit_cost: unitCost,
          discount: 0, total: lineTotal, profit: lineTotal - lineCost,
        };
      });

      // Validate against AVAILABLE stock (quantity - reserved)
      for (const item of saleItems) {
        const inv = warehouseInventory.find(i => i.product_id === item.product_id);
        const avail = (inv?.quantity || 0) - (inv?.reserved_quantity || 0);
        if (item.quantity > avail) throw new Error(`Only ${avail} available of ${item.product_name}`);
      }

      const totalProfit = total - totalCost;

      const sale = await base44.entities.Sale.create({
        invoice_number: invoiceNum,
        customer_id: form.customer_id || undefined,
        customer_name: customer?.name || 'Walk-in',
        warehouse_id: form.warehouse_id,
        warehouse_name: warehouse?.name || '',
        sale_type: form.sale_type,
        items: saleItems,
        subtotal, discount: discountAmt, tax: taxAmt, total,
        total_cost: totalCost, total_profit: totalProfit,
        paid_amount: 0,
        status: 'pending',
        workflow_status: 'pending_release',
        sale_date: form.sale_date,
        notes: form.notes,
      });

      // RESERVE stock (do not deduct yet)
      for (const item of saleItems) {
        const inv = warehouseInventory.find(i => i.product_id === item.product_id);
        if (inv) {
          await base44.entities.InventoryStock.update(inv.id, {
            reserved_quantity: (inv.reserved_quantity || 0) + item.quantity,
          });
        }
      }

      // Create the Warehouse Release record (pending pick)
      await base44.entities.WarehouseRelease.create({
        sale_id: sale.id,
        invoice_number: invoiceNum,
        customer_name: customer?.name || 'Walk-in',
        warehouse_id: form.warehouse_id,
        warehouse_name: warehouse?.name || '',
        items: JSON.stringify(saleItems),
        pick_status: 'pending',
        status: 'pending',
        release_date: form.sale_date,
      });

      await logActivity({ module: 'Sale', action: 'created', entityType: 'Sale', entityId: sale.id, description: `Created ${form.sale_type} sale ${invoiceNum} (ETB ${fmt(total)}) — stock reserved, pending warehouse release` });
    },
    onSuccess: () => { qc.invalidateQueries(); onBack(); },
    onError: (err) => alert(err.message),
  });

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-2" />Back to Sales</Button>
      <h2 className="text-xl font-bold">New Sale</h2>

      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label>Sale Type</Label>
            <Select value={form.sale_type} onValueChange={v => setForm({ ...form, sale_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="credit">Credit</SelectItem></SelectContent>
            </Select>
          </div>
          <div>
            <Label>Customer</Label>
            <Select value={form.customer_id} onValueChange={v => setForm({ ...form, customer_id: v })}>
              <SelectTrigger><SelectValue placeholder="Walk-in" /></SelectTrigger>
              <SelectContent>{customers.filter(c => c.status === 'active').map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Warehouse *</Label>
            <Select value={form.warehouse_id} onValueChange={v => setForm({ ...form, warehouse_id: v })}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Date</Label><Input type="date" value={form.sale_date} onChange={e => setForm({ ...form, sale_date: e.target.value })} /></div>
        </div>

        {/* Items */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Items</Label>
            <Button size="sm" variant="outline" onClick={addItem} disabled={!form.warehouse_id}><Plus className="w-3.5 h-3.5 mr-1" />Add Item</Button>
          </div>
          {items.map((item, idx) => {
            const { inv } = getProductInfo(item.product_id);
            return (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <Label className="text-xs">Product</Label>
                  <Select value={item.product_id} onValueChange={v => updateItem(idx, 'product_id', v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      {warehouseInventory.filter(i => ((i.quantity || 0) - (i.reserved_quantity || 0)) > 0).map(i => {
                        const av = (i.quantity || 0) - (i.reserved_quantity || 0);
                        return <SelectItem key={i.product_id} value={i.product_id}>{i.product_name} ({av} available)</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  {(() => { const av = inv ? (inv.quantity||0)-(inv.reserved_quantity||0) : null; return (
                  <Label className="text-xs">Qty{av != null ? ` (max ${av})` : ''}</Label>
                  ); })()}
                  <Input type="number" min="1" max={inv ? (inv.quantity||0)-(inv.reserved_quantity||0) : 9999} value={item.quantity} onChange={e => updateItem(idx, 'quantity', Number(e.target.value))} />
                </div>
                <div className="col-span-3">
                  <Label className="text-xs">Unit Price (ETB)</Label>
                  <Input type="number" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', Number(e.target.value))} />
                </div>
                <div className="col-span-1 text-right font-semibold text-sm pt-5 text-xs">
                  {fmt(item.quantity * item.unit_price)}
                </div>
                <div className="col-span-1">
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            );
          })}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed border-border rounded-lg">
              {form.warehouse_id ? 'Click "Add Item" to start' : 'Select a warehouse first'}
            </p>
          )}
        </div>

        {/* Totals */}
        <div className="border-t border-border pt-4 space-y-2 max-w-sm ml-auto text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>ETB {fmt(subtotal)}</span></div>
          <div className="flex justify-between items-center gap-2">
            <span className="text-muted-foreground">Discount %</span>
            <div className="flex items-center gap-1">
              <Input type="number" min="0" max="100" step="0.01" value={form.discount_pct} onChange={e => setForm({ ...form, discount_pct: Number(e.target.value) })} className="w-20 h-8 text-right" />
              <span className="text-muted-foreground text-xs">%</span>
            </div>
          </div>
          {discountAmt > 0 && <div className="flex justify-between text-red-500"><span>Discount</span><span>-ETB {fmt(discountAmt)}</span></div>}
          <div className="flex justify-between items-center gap-2">
            <span className="text-muted-foreground">Tax %</span>
            <div className="flex items-center gap-1">
              <Input type="number" min="0" max="100" step="0.01" value={form.tax} onChange={e => setForm({ ...form, tax: Number(e.target.value) })} className="w-20 h-8 text-right" />
              <span className="text-muted-foreground text-xs">%</span>
            </div>
          </div>
          {taxAmt > 0 && <div className="flex justify-between"><span>Tax</span><span>+ETB {fmt(taxAmt)}</span></div>}
          <div className="flex justify-between font-bold text-lg border-t border-border pt-2">
            <span>Total</span><span>ETB {fmt(total)}</span>
          </div>
        </div>

        <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          Creating this sale will <strong>reserve</strong> the stock and send it to the Warehouse Release queue. Stock is only deducted after the warehouse picks the items and an admin gives final approval.
        </div>
        <Button className="w-full" onClick={() => saveSale.mutate()} disabled={saveSale.isPending || items.length === 0 || !form.warehouse_id}>
          {saveSale.isPending ? 'Processing...' : 'Create Sale & Reserve Stock'}
        </Button>
      </div>
    </div>
  );
}