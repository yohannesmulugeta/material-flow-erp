import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingCart, CreditCard, TrendingUp, Package,
  Users, AlertTriangle, ArrowLeftRight, Activity
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import StatCard from '@/components/ui/StatCard';
import PageHeader from '@/components/ui/PageHeader';
import { format } from 'date-fns';

const COLORS = ['hsl(224, 76%, 48%)', 'hsl(160, 60%, 45%)', 'hsl(30, 80%, 55%)', 'hsl(280, 65%, 60%)', 'hsl(340, 75%, 55%)'];

export default function Dashboard() {
  const navigate = useNavigate();
  const today = format(new Date(), 'yyyy-MM-dd');

  const { data: sales = [] } = useQuery({ queryKey: ['sales'], queryFn: () => base44.entities.Sale.list('-created_date', 100) });
  const { data: payments = [] } = useQuery({ queryKey: ['payments'], queryFn: () => base44.entities.Payment.list('-created_date', 100) });
  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => base44.entities.Customer.list() });
  const { data: transfers = [] } = useQuery({ queryKey: ['transfers-pending'], queryFn: () => base44.entities.Transfer.filter({ status: 'pending' }) });
  const { data: damages = [] } = useQuery({ queryKey: ['damages-pending'], queryFn: () => base44.entities.DamageRecord.filter({ status: 'pending' }) });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: logs = [] } = useQuery({ queryKey: ['activity-recent'], queryFn: () => base44.entities.ActivityLog.list('-created_date', 10) });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: () => base44.entities.ProductCategory.list() });

  const todaySales = sales.filter(s => s.sale_date === today && s.status === 'completed');
  const todayPayments = payments.filter(p => p.payment_date === today && p.type === 'customer_payment' && p.status === 'active');
  const todaySalesTotal = todaySales.reduce((s, x) => s + (x.total || 0), 0);
  const todayCollections = todayPayments.reduce((s, x) => s + (x.amount || 0), 0);
  const todayProfit = todaySales.reduce((s, x) => s + (x.total_profit || 0), 0);
  const totalInventoryValue = inventory.reduce((s, x) => s + (x.total_value_etb || 0), 0);
  const outstandingCredit = customers.reduce((s, x) => s + ((x.balance || 0) > 0 ? x.balance : 0), 0);

  const lowStockProducts = products.filter(p => {
    const totalQty = inventory.filter(i => i.product_id === p.id).reduce((s, x) => s + (x.quantity || 0), 0);
    return totalQty <= (p.min_stock_level || 0) && p.status === 'active';
  });

  const pendingApprovals = transfers.length + damages.length;

  // Chart data: last 7 days sales
  const salesByDay = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = format(d, 'yyyy-MM-dd');
    const dayLabel = format(d, 'EEE');
    const daySales = sales.filter(s => s.sale_date === dateStr && s.status === 'completed');
    salesByDay.push({ day: dayLabel, sales: daySales.reduce((s, x) => s + (x.total || 0), 0) });
  }

  // Category distribution
  const categoryMap = {};
  inventory.forEach(item => {
    const prod = products.find(p => p.id === item.product_id);
    const catId = prod?.category_id || '';
    const cat = categories.find(c => c.id === catId);
    const catName = cat?.name || 'Uncategorized';
    categoryMap[catName] = (categoryMap[catName] || 0) + (item.total_value_etb || 0);
  });
  const categoryData = Object.entries(categoryMap).map(([name, value]) => ({ name, value }));

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Overview of your business operations" />

      {/* Row 1: Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Today's Sales"
          value={`ETB ${fmt(todaySalesTotal)}`}
          icon={ShoppingCart}
          subtitle={`${todaySales.length} invoices`}
          onClick={() => navigate('/sales')}
        />
        <StatCard
          title="Today's Collections"
          value={`ETB ${fmt(todayCollections)}`}
          icon={CreditCard}
          onClick={() => navigate('/payments')}
        />
        <StatCard
          title="Today's Profit"
          value={`ETB ${fmt(todayProfit)}`}
          icon={TrendingUp}
          onClick={() => navigate('/reports')}
        />
        <StatCard
          title="Inventory Value"
          value={`ETB ${fmt(totalInventoryValue)}`}
          icon={Package}
          onClick={() => navigate('/inventory')}
        />
      </div>

      {/* Row 2: Operational KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Outstanding Credit"
          value={`ETB ${fmt(outstandingCredit)}`}
          icon={Users}
          subtitle="From credit customers"
          onClick={() => navigate('/customers')}
        />
        <StatCard
          title="Low Stock Items"
          value={lowStockProducts.length}
          icon={AlertTriangle}
          iconClassName="bg-amber-500/10"
          subtitle="Need restocking"
          onClick={() => navigate('/inventory')}
        />
        <StatCard
          title="Pending Approvals"
          value={pendingApprovals}
          icon={ArrowLeftRight}
          iconClassName="bg-purple-500/10"
          subtitle={`${transfers.length} transfers, ${damages.length} damages`}
          onClick={() => navigate('/approvals')}
        />
        <StatCard
          title="Pending Damages"
          value={damages.length}
          icon={AlertTriangle}
          iconClassName="bg-red-500/10"
          onClick={() => navigate('/damages')}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Sales — Last 7 Days (ETB)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} width={60} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                  formatter={v => [`ETB ${fmt(v)}`, 'Sales']}
                />
                <Bar dataKey="sales" fill="hsl(224, 76%, 48%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Inventory by Category</h3>
          <div className="h-48">
            {categoryData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px' }} formatter={v => `ETB ${fmt(v)}`} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No inventory data</div>
            )}
          </div>
          {categoryData.length > 0 && (
            <div className="mt-2 space-y-1">
              {categoryData.slice(0, 4).map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground truncate">{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4" /> Recent Activity
        </h3>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No recent activity</p>
        ) : (
          <div className="space-y-2">
            {logs.map(log => (
              <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{log.description || `${log.action} in ${log.module}`}</p>
                  <p className="text-xs text-muted-foreground">{log.user_name} · {format(new Date(log.created_date), 'MMM d, h:mm a')}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}