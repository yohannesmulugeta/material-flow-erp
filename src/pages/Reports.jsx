import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Cell } from 'recharts';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import { exportReportXLSX, exportReportPDF } from '@/lib/reportEngine';
import { format, subDays, startOfMonth, endOfMonth, startOfYear, parseISO } from 'date-fns';
import { Download, FileSpreadsheet } from 'lucide-react';

const BRAND = ['hsl(224,76%,48%)', 'hsl(160,60%,45%)', 'hsl(30,80%,55%)', 'hsl(280,65%,60%)', 'hsl(340,75%,55%)'];
const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const fmtInt = (n) => new Intl.NumberFormat('en-US').format(n || 0);

const REPORT_GROUPS = [
  { group: 'Sales', reports: [
    { value: 'daily_sales', label: 'Daily Sales' },
    { value: 'monthly_sales', label: 'Monthly Sales' },
    { value: 'product_sales', label: 'Product Sales' },
    { value: 'customer_sales', label: 'Customer Sales' },
  ]},
  { group: 'Inventory', reports: [
    { value: 'stock_balance', label: 'Stock Balance Report' },
    { value: 'warehouse_stock', label: 'Warehouse Stock Report' },
    { value: 'inventory_valuation', label: 'Inventory Valuation' },
    { value: 'inventory_movement', label: 'Inventory Movement' },
    { value: 'low_stock', label: 'Low Stock Report' },
  ]},
  { group: 'Credit', reports: [
    { value: 'customer_credit', label: 'Customer Credit Summary' },
    { value: 'outstanding_balances', label: 'Outstanding Balances' },
  ]},
  { group: 'Profit', reports: [
    { value: 'product_profit', label: 'Product Profitability' },
    { value: 'monthly_profit', label: 'Monthly Profit' },
  ]},
  { group: 'Warehouse', reports: [
    { value: 'transfer_report', label: 'Transfer Report' },
  ]},
  { group: 'Import', reports: [
    { value: 'container_report', label: 'Container Report' },
    { value: 'supplier_report', label: 'Supplier Report' },
  ]},
  { group: 'Audit', reports: [
    { value: 'activity_log_report', label: 'Activity Log Report' },
  ]},
];

export default function Reports() {
  const [reportType, setReportType] = useState('daily_sales');
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data: sales = [] } = useQuery({ queryKey: ['sales'], queryFn: () => base44.entities.Sale.list('-created_date', 500) });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: transactions = [] } = useQuery({ queryKey: ['stock-tx'], queryFn: () => base44.entities.StockTransaction.list('-created_date', 500) });
  const { data: containers = [] } = useQuery({ queryKey: ['containers'], queryFn: () => base44.entities.Container.list('-created_date') });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => base44.entities.Customer.list() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list() });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: transfers = [] } = useQuery({ queryKey: ['transfers'], queryFn: () => base44.entities.Transfer.list('-created_date') });
  const { data: logs = [] } = useQuery({ queryKey: ['activity-logs'], queryFn: () => base44.entities.ActivityLog.list('-created_date', 200) });

  const filteredSales = useMemo(() =>
    sales.filter(s => s.status === 'completed' && s.sale_date >= dateFrom && s.sale_date <= dateTo),
    [sales, dateFrom, dateTo]);

  const filteredTx = useMemo(() =>
    transactions.filter(t => (t.created_at || '').slice(0, 10) >= dateFrom && (t.created_at || '').slice(0, 10) <= dateTo),
    [transactions, dateFrom, dateTo]);

  // ─── Report data builders ──────────────────────────────────────────────────
  const reportData = useMemo(() => {
    switch (reportType) {
      case 'daily_sales': {
        const map = {};
        filteredSales.forEach(s => { if (!map[s.sale_date]) map[s.sale_date] = { date: s.sale_date, invoices: 0, revenue: 0, profit: 0 }; map[s.sale_date].invoices++; map[s.sale_date].revenue += s.total || 0; map[s.sale_date].profit += s.total_profit || 0; });
        return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
      }
      case 'monthly_sales': {
        const map = {};
        sales.filter(s => s.status === 'completed').forEach(s => { const m = (s.sale_date || '').slice(0, 7); if (!map[m]) map[m] = { month: m, invoices: 0, revenue: 0, profit: 0 }; map[m].invoices++; map[m].revenue += s.total || 0; map[m].profit += s.total_profit || 0; });
        return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
      }
      case 'product_sales': {
        const map = {};
        filteredSales.forEach(s => {
          let items = [];
          try { items = typeof s.items === 'string' ? JSON.parse(s.items) : (s.items || []); } catch {}
          items.forEach(item => {
            if (!map[item.product_name]) map[item.product_name] = { product: item.product_name, qty: 0, revenue: 0, profit: 0 };
            map[item.product_name].qty += item.quantity || 0;
            map[item.product_name].revenue += item.total || 0;
            map[item.product_name].profit += item.profit || 0;
          });
        });
        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
      }
      case 'customer_sales': {
        const map = {};
        filteredSales.forEach(s => { const k = s.customer_name || 'Walk-in'; if (!map[k]) map[k] = { customer: k, invoices: 0, revenue: 0, profit: 0 }; map[k].invoices++; map[k].revenue += s.total || 0; map[k].profit += s.total_profit || 0; });
        return Object.values(map).sort((a, b) => b.revenue - a.revenue);
      }
      case 'stock_balance':
        return inventory.map(i => ({ Product: i.product_name, Warehouse: i.warehouse_name, Quantity: i.quantity, 'Avg Cost (ETB)': i.avg_cost_etb, 'Total Value (ETB)': i.total_value_etb }));
      case 'warehouse_stock': {
        const map = {};
        inventory.forEach(i => { if (!map[i.warehouse_name]) map[i.warehouse_name] = { Warehouse: i.warehouse_name, Products: 0, 'Total Qty': 0, 'Total Value (ETB)': 0 }; map[i.warehouse_name].Products++; map[i.warehouse_name]['Total Qty'] += i.quantity || 0; map[i.warehouse_name]['Total Value (ETB)'] += i.total_value_etb || 0; });
        return Object.values(map);
      }
      case 'inventory_valuation':
        return inventory.map(i => ({ Product: i.product_name, Warehouse: i.warehouse_name, Qty: i.quantity, 'Avg Cost': i.avg_cost_etb, 'Total Value': i.total_value_etb }));
      case 'inventory_movement':
        return filteredTx.map(t => ({ Date: (t.created_at || '').slice(0, 10), Product: t.product_name, Warehouse: t.warehouse_name, Type: t.type, Reason: (t.reason || '').replace(/_/g, ' '), Qty: t.quantity }));
      case 'low_stock':
        return products.filter(p => { const qty = inventory.filter(i => i.product_id === p.id).reduce((s, i) => s + (i.quantity || 0), 0); return qty <= (p.min_stock_level || 0) && p.status === 'active'; }).map(p => { const qty = inventory.filter(i => i.product_id === p.id).reduce((s, i) => s + (i.quantity || 0), 0); return { Product: p.name, SKU: p.sku, 'Current Stock': qty, 'Min Level': p.min_stock_level, Shortage: p.min_stock_level - qty }; });
      case 'customer_credit':
        return customers.filter(c => (c.balance || 0) > 0).map(c => ({ Customer: c.name, Phone: c.phone || '', 'Credit Limit': c.credit_limit, 'Total Credit': c.total_credit, 'Total Paid': c.total_paid, 'Balance (ETB)': c.balance })).sort((a, b) => b['Balance (ETB)'] - a['Balance (ETB)']);
      case 'outstanding_balances':
        return customers.filter(c => (c.balance || 0) > 0).map(c => ({ Customer: c.name, 'Outstanding (ETB)': c.balance, 'Credit Limit': c.credit_limit, 'Over Limit': Math.max(0, c.balance - c.credit_limit) }));
      case 'product_profit': {
        const map = {};
        sales.filter(s => s.status === 'completed').forEach(s => {
          let items = [];
          try { items = typeof s.items === 'string' ? JSON.parse(s.items) : (s.items || []); } catch {}
          items.forEach(item => { if (!map[item.product_name]) map[item.product_name] = { Product: item.product_name, 'Units Sold': 0, Revenue: 0, Cost: 0, Profit: 0 }; map[item.product_name]['Units Sold'] += item.quantity || 0; map[item.product_name].Revenue += item.total || 0; const cost = (item.unit_cost || 0) * (item.quantity || 0); map[item.product_name].Cost += cost; map[item.product_name].Profit += (item.total || 0) - cost; });
        });
        return Object.values(map).sort((a, b) => b.Profit - a.Profit);
      }
      case 'monthly_profit': {
        const map = {};
        sales.filter(s => s.status === 'completed').forEach(s => { const m = (s.sale_date || '').slice(0, 7); if (!map[m]) map[m] = { Month: m, Revenue: 0, Cost: 0, Profit: 0 }; map[m].Revenue += s.total || 0; map[m].Cost += s.total_cost || 0; map[m].Profit += s.total_profit || 0; });
        return Object.values(map).sort((a, b) => a.Month.localeCompare(b.Month));
      }
      case 'transfer_report':
        return transfers.map(t => ({ Date: (t.created_at || '').slice(0, 10), Product: t.product_name, Qty: t.quantity, From: t.source_warehouse_name, To: t.destination_warehouse_name, Status: t.status, Reason: t.reason || '' }));
      case 'container_report':
        return containers.map(c => ({ 'Container #': c.container_number, Supplier: c.supplier_name, Country: c.country, Arrival: c.arrival_date || '', 'Ex. Rate': c.exchange_rate, 'Product Cost (USD)': c.total_product_cost_usd, 'Import Cost (ETB)': c.total_import_cost_etb, Status: c.status }));
      case 'supplier_report':
        return suppliers.map(s => ({ Supplier: s.name, Country: s.country || '', Contact: s.contact_person || '', Phone: s.phone || '', Email: s.email || '', Status: s.status }));
      case 'activity_log_report':
        return logs.map(l => ({ Date: (l.created_at || '').slice(0, 10), User: l.user_name || '', Module: l.module, Action: l.action, Description: l.description || '' }));
      default: return [];
    }
  }, [reportType, filteredSales, filteredTx, sales, inventory, transactions, customers, products, containers, suppliers, transfers, logs]);

  const reportLabel = REPORT_GROUPS.flatMap(g => g.reports).find(r => r.value === reportType)?.label || reportType;
  const dateRange = `${dateFrom} to ${dateTo}`;

  function handleExportXLSX() {
    const headers = reportData.length > 0 ? Object.keys(reportData[0]) : [];
    const rows = reportData.map(row => headers.map(h => row[h]));
    exportReportXLSX({ filename: `${reportType}-${dateFrom}`, title: reportLabel, subtitle: dateRange, headers, rows, autoTotals: true });
  }

  function handleExportPDF() {
    const headers = reportData.length > 0 ? Object.keys(reportData[0]) : [];
    const rows = reportData.map(row => headers.map(h => String(row[h] ?? '')));
    exportReportPDF({ filename: `${reportType}-${dateFrom}`, title: reportLabel, subtitle: dateRange, headers, rows, orientation: headers.length > 6 ? 'landscape' : 'portrait' });
  }

  // Chart for sales reports
  const showChart = ['daily_sales', 'monthly_sales', 'monthly_profit'].includes(reportType);
  const chartKey = reportType === 'monthly_profit' ? 'Profit' : 'revenue';
  const chartLabel = reportType === 'monthly_profit' ? 'Month' : 'date';

  return (
    <div className="space-y-5">
      <PageHeader title="Reports" description="Export and analyse business data"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleExportXLSX} disabled={!reportData.length}><FileSpreadsheet className="w-4 h-4 mr-1.5" />Excel</Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!reportData.length}><Download className="w-4 h-4 mr-1.5" />PDF</Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Report</p>
          <Select value={reportType} onValueChange={setReportType}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {REPORT_GROUPS.map(g => (
                <React.Fragment key={g.group}>
                  <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{g.group}</div>
                  {g.reports.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </React.Fragment>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">From</p>
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-9" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">To</p>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-9" />
        </div>
        <div className="text-sm text-muted-foreground pb-1">{reportData.length} records</div>
      </div>

      {/* Chart */}
      {showChart && reportData.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="font-semibold text-sm mb-3">{reportLabel}</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={reportData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
              <XAxis dataKey={chartLabel} tick={{ fontSize: 10 }} tickFormatter={v => String(v).slice(5)} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => `ETB ${fmt(v)}`} />
              <Bar dataKey={chartKey} name={chartKey} fill={BRAND[0]} radius={[3, 3, 0, 0]}>
                {reportData.map((row, i) => <Cell key={i} fill={(row[chartKey] || 0) < 0 ? BRAND[4] : BRAND[0]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      {reportData.length > 0 ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {Object.keys(reportData[0]).map(h => (
                    <th key={h} className="px-4 py-2.5 text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {reportData.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/30 transition-colors">
                    {Object.entries(row).map(([k, v]) => {
                      const isNum = typeof v === 'number';
                      return <td key={k} className={`px-4 py-2 ${isNum ? 'text-right tabular-nums' : ''}`}>{isNum ? fmt(v) : String(v ?? '—')}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
              {/* Totals row for numeric columns */}
              <tfoot className="bg-muted/50 border-t border-border font-semibold">
                <tr>
                  {Object.keys(reportData[0]).map((h, hi) => {
                    const vals = reportData.map(r => r[h]);
                    const allNum = vals.every(v => typeof v === 'number');
                    const sum = allNum ? vals.reduce((s, v) => s + v, 0) : null;
                    return <td key={h} className={`px-4 py-2 text-xs ${sum !== null ? 'text-right tabular-nums' : ''}`}>{hi === 0 ? 'TOTAL' : sum !== null ? fmt(sum) : ''}</td>;
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground text-sm">
          No data for the selected report and date range.
        </div>
      )}
    </div>
  );
}
