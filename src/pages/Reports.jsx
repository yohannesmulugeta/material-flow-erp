import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell,
} from 'recharts';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import { exportReportXLSX, exportReportPDF } from '@/lib/reportEngine';
import { format, subDays } from 'date-fns';
import { Download, FileSpreadsheet } from 'lucide-react';

const BRAND_COLORS = ['hsl(224,76%,48%)', 'hsl(160,60%,45%)', 'hsl(30,80%,55%)', 'hsl(280,65%,60%)', 'hsl(340,75%,55%)'];

const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

export default function Reports() {
  const [reportType, setReportType] = useState('profit');

  const { data: sales = [] } = useQuery({ queryKey: ['sales'], queryFn: () => base44.entities.Sale.list('-created_date', 200) });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: transactions = [] } = useQuery({ queryKey: ['stock-tx'], queryFn: () => base44.entities.StockTransaction.list('-created_date', 200) });
  const { data: containers = [] } = useQuery({ queryKey: ['containers'], queryFn: () => base44.entities.Container.list('-created_date', 100) });

  // Daily profit last 30 days
  const profitData = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const d = subDays(new Date(), 29 - i);
      const dateStr = format(d, 'yyyy-MM-dd');
      const day = sales.filter(s => s.sale_date === dateStr && s.status === 'completed');
      return {
        date: format(d, 'MMM d'),
        revenue: day.reduce((s, x) => s + (x.total || 0), 0),
        profit: day.reduce((s, x) => s + (x.total_profit || 0), 0),
      };
    });
  }, [sales]);

  const stockColumns = [
    { header: 'Product', accessorKey: 'product_name', cell: r => <span className="font-medium">{r.product_name}</span> },
    { header: 'Warehouse', accessorKey: 'warehouse_name' },
    { header: 'Quantity', accessorKey: 'quantity', cell: r => <span className="font-semibold tabular-nums">{r.quantity}</span> },
    { header: 'Avg Cost (ETB)', cell: r => <span className="tabular-nums">{fmt(r.avg_cost_etb)}</span> },
    { header: 'Total Value (ETB)', cell: r => <span className="font-semibold tabular-nums">{fmt(r.total_value_etb)}</span> },
  ];

  const movementColumns = [
    { header: 'Date', cell: r => r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '—' },
    { header: 'Product', accessorKey: 'product_name', cell: r => <span className="font-medium">{r.product_name}</span> },
    { header: 'Warehouse', accessorKey: 'warehouse_name' },
    { header: 'Type', cell: r => <span className={r.type === 'stock_in' ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{r.type === 'stock_in' ? '↑ In' : '↓ Out'}</span> },
    { header: 'Reason', cell: r => (r.reason || '').replace(/_/g, ' ') },
    { header: 'Qty', accessorKey: 'quantity', cell: r => <span className="tabular-nums font-semibold">{r.quantity}</span> },
  ];

  const salesColumns = [
    { header: 'Invoice', accessorKey: 'invoice_number', cell: r => <span className="font-mono text-sm">{r.invoice_number}</span> },
    { header: 'Customer', accessorKey: 'customer_name', cell: r => r.customer_name || 'Walk-in' },
    { header: 'Date', cell: r => r.sale_date || '—' },
    { header: 'Total (ETB)', cell: r => <span className="tabular-nums font-semibold">{fmt(r.total)}</span> },
    { header: 'Profit (ETB)', cell: r => <span className="tabular-nums text-emerald-600 font-medium">{fmt(r.total_profit)}</span> },
    { header: 'Status', accessorKey: 'status' },
  ];

  function handleExportXLSX() {
    if (reportType === 'stock') {
      const rows = inventory.map(r => ({
        Product: r.product_name, Warehouse: r.warehouse_name,
        Quantity: r.quantity, 'Avg Cost (ETB)': r.avg_cost_etb, 'Total Value (ETB)': r.total_value_etb,
      }));
      exportReportXLSX({ filename: 'inventory-report', title: 'Inventory Stock Report', rows, autoTotals: true });
    } else if (reportType === 'movements') {
      const rows = transactions.map(r => ({
        Date: r.created_at ? format(new Date(r.created_at), 'yyyy-MM-dd') : '',
        Product: r.product_name, Warehouse: r.warehouse_name,
        Type: r.type, Reason: (r.reason || '').replace(/_/g, ' '), Quantity: r.quantity,
      }));
      exportReportXLSX({ filename: 'stock-movements', title: 'Stock Movements Report', rows, autoTotals: true });
    } else {
      const rows = sales.filter(s => s.status === 'completed').map(s => ({
        Invoice: s.invoice_number, Customer: s.customer_name || 'Walk-in',
        Date: s.sale_date, 'Total (ETB)': s.total, 'Profit (ETB)': s.total_profit,
      }));
      exportReportXLSX({ filename: 'sales-report', title: 'Sales & Profit Report', rows, autoTotals: true });
    }
  }

  function handleExportPDF() {
    if (reportType === 'stock') {
      exportReportPDF({
        filename: 'inventory-report',
        title: 'Inventory Stock Report',
        headers: ['Product', 'Warehouse', 'Quantity', 'Avg Cost (ETB)', 'Total Value (ETB)'],
        rows: inventory.map(r => [r.product_name, r.warehouse_name, r.quantity, fmt(r.avg_cost_etb), fmt(r.total_value_etb)]),
        autoTotals: false,
      });
    } else {
      exportReportPDF({
        filename: 'sales-report',
        title: 'Sales & Profit Report',
        headers: ['Invoice', 'Customer', 'Date', 'Total (ETB)', 'Profit (ETB)'],
        rows: sales.filter(s => s.status === 'completed').map(s => [s.invoice_number, s.customer_name || 'Walk-in', s.sale_date, fmt(s.total), fmt(s.total_profit)]),
        autoTotals: false,
      });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Export and analyse business data"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportXLSX}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <Download className="w-4 h-4 mr-2" />PDF
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3">
        <Select value={reportType} onValueChange={setReportType}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[['profit','Sales & Profit'],['stock','Inventory Stock'],['movements','Stock Movements'],['containers','Containers']].map(([v,l]) => (
              v ? <SelectItem key={v} value={v}>{l}</SelectItem> : null
            ))}
          </SelectContent>
        </Select>
      </div>

      {reportType === 'profit' && (
        <>
          <div className="rounded-xl border bg-card p-4 shadow-sm">
            <h3 className="font-semibold mb-3 text-sm">Revenue & Profit — Last 30 Days</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={profitData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(0, 6)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [`ETB ${fmt(v)}`]} />
                <Bar dataKey="revenue" name="Revenue" fill={BRAND_COLORS[0]} radius={[3,3,0,0]} />
                <Bar dataKey="profit" name="Profit" fill={BRAND_COLORS[1]} radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <DataTable columns={salesColumns} data={sales.filter(s => s.status === 'completed')} />
        </>
      )}

      {reportType === 'stock' && (
        <DataTable columns={stockColumns} data={inventory} />
      )}

      {reportType === 'movements' && (
        <DataTable columns={movementColumns} data={transactions} />
      )}

      {reportType === 'containers' && (
        <DataTable
          columns={[
            { header: 'Container #', accessorKey: 'container_number', cell: r => <span className="font-mono font-medium">{r.container_number}</span> },
            { header: 'Supplier', accessorKey: 'supplier_name' },
            { header: 'Arrival', cell: r => r.arrival_date || '—' },
            { header: 'Status', accessorKey: 'status' },
            { header: 'Product Cost (USD)', cell: r => <span className="tabular-nums">{fmt(r.total_product_cost_usd)}</span> },
            { header: 'Import Cost (ETB)', cell: r => <span className="tabular-nums font-semibold">{fmt(r.total_import_cost_etb)}</span> },
          ]}
          data={containers}
        />
      )}
    </div>
  );
}
