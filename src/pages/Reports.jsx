import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';

export default function Reports() {
  const [reportType, setReportType] = useState('profit');

  const { data: sales = [] } = useQuery({ queryKey: ['sales'], queryFn: () => base44.entities.Sale.list('-created_date', 200) });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: transactions = [] } = useQuery({ queryKey: ['stock-tx'], queryFn: () => base44.entities.StockTransaction.list('-created_date', 200) });
  const { data: containers = [] } = useQuery({ queryKey: ['containers'], queryFn: () => base44.entities.Container.list('-created_date', 100) });

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  // Daily profit for last 30 days
  const profitData = [];
  for (let i = 29; i >= 0; i--) {
    const d = subDays(new Date(), i);
    const dateStr = format(d, 'yyyy-MM-dd');
    const daySales = sales.filter(s => s.sale_date === dateStr && s.status === 'completed');
    profitData.push({
      date: format(d, 'MMM d'),
      revenue: daySales.reduce((s, x) => s + (x.total || 0), 0),
      profit: daySales.reduce((s, x) => s + (x.total_profit || 0), 0),
    });
  }

  const stockColumns = [
    { header: 'Product', accessorKey: 'product_name', cell: row => <span className="font-medium">{row.product_name}</span> },
    { header: 'Warehouse', accessorKey: 'warehouse_name' },
    { header: 'Quantity', accessorKey: 'quantity', cell: row => <span className="font-semibold">{row.quantity}</span> },
    { header: 'Avg Cost', cell: row => `ETB ${fmt(row.avg_cost_etb)}` },
    { header: 'Total Value', cell: row => <span className="font-semibold">ETB {fmt(row.total_value_etb)}</span> },
  ];

  const movementColumns = [
    { header: 'Date', cell: row => format(new Date(row.created_date), 'MMM d, yyyy') },
    { header: 'Product', accessorKey: 'product_name', cell: row => <span className="font-medium">{row.product_name}</span> },
    { header: 'Warehouse', accessorKey: 'warehouse_name' },
    { header: 'Type', cell: row => <span className={row.type === 'stock_in' ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{row.type === 'stock_in' ? '↑ In' : '↓ Out'}</span> },
    { header: 'Reason', cell: row => (row.reason || '').replace(/_/g, ' ') },
    { header: 'Quantity', accessorKey: 'quantity', cell: row => <span className="font-semibold">{row.quantity}</span> },
  ];

  const salesColumns = [
    { header: 'Invoice', accessorKey: 'invoice_number' },
    { header: 'Customer', accessorKey: 'customer_name' },
    { header: 'Date', cell: row => row.sale_date ? format(new Date(row.sale_date), 'MMM d, yyyy') : '—' },
    { header: 'Total', cell: row => `ETB ${fmt(row.total)}` },
    { header: 'Cost', cell: row => `ETB ${fmt(row.total_cost)}` },
    { header: 'Profit', cell: row => <span className="text-emerald-600 font-semibold">ETB {fmt(row.total_profit)}</span> },
  ];

  const totalRevenue = sales.filter(s => s.status === 'completed').reduce((s, x) => s + (x.total || 0), 0);
  const totalProfit = sales.filter(s => s.status === 'completed').reduce((s, x) => s + (x.total_profit || 0), 0);
  const totalInvValue = inventory.reduce((s, x) => s + (x.total_value_etb || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Business analytics and reports"
        actions={
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="profit">Profit Report</SelectItem>
              <SelectItem value="stock">Stock Balance</SelectItem>
              <SelectItem value="movement">Inventory Movement</SelectItem>
              <SelectItem value="sales">Sales Report</SelectItem>
              <SelectItem value="container">Container Report</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Total Revenue</p>
          <p className="text-2xl font-bold">ETB {fmt(totalRevenue)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Total Profit</p>
          <p className="text-2xl font-bold text-emerald-600">ETB {fmt(totalProfit)}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Inventory Value</p>
          <p className="text-2xl font-bold">ETB {fmt(totalInvValue)}</p>
        </div>
      </div>

      {reportType === 'profit' && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="text-sm font-semibold mb-4">Revenue & Profit — Last 30 Days</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={profitData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" className="text-xs fill-muted-foreground" />
                  <YAxis className="text-xs fill-muted-foreground" />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Line type="monotone" dataKey="revenue" stroke="hsl(224, 76%, 48%)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="profit" stroke="hsl(160, 60%, 45%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <DataTable columns={salesColumns} data={sales.filter(s => s.status === 'completed')} />
        </div>
      )}

      {reportType === 'stock' && <DataTable columns={stockColumns} data={inventory} />}
      {reportType === 'movement' && <DataTable columns={movementColumns} data={transactions} />}
      {reportType === 'sales' && <DataTable columns={salesColumns} data={sales} />}
      {reportType === 'container' && (
        <DataTable
          columns={[
            { header: 'Container #', accessorKey: 'container_number' },
            { header: 'Supplier', accessorKey: 'supplier_name' },
            { header: 'Arrival', cell: row => row.arrival_date ? format(new Date(row.arrival_date), 'MMM d, yyyy') : '—' },
            { header: 'Exchange Rate', cell: row => fmt(row.exchange_rate) },
            { header: 'Import Cost', cell: row => `ETB ${fmt(row.total_import_cost_etb)}` },
            { header: 'Status', cell: row => (row.status || '').replace(/_/g, ' ') },
          ]}
          data={containers}
        />
      )}
    </div>
  );
}