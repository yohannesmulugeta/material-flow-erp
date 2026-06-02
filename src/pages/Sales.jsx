import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Plus, Eye } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import NewSaleForm from '@/components/sales/NewSaleForm';
import SaleDetail from '@/components/sales/SaleDetail';
import { format } from 'date-fns';

const CAN_SEE_PROFIT = ['super_admin', 'admin', 'manager', 'accountant'];

export default function Sales() {
  const { role } = useAuth();
  const canSeeProfit = CAN_SEE_PROFIT.includes(role);

  const [view, setView] = useState('list');
  const [selectedSale, setSelectedSale] = useState(null);
  const { data: sales = [], isLoading } = useQuery({
    queryKey: ['sales'],
    queryFn: () => base44.entities.Sale.list('-created_date'),
  });

  const fmt = (n) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);

  const columns = [
    { header: 'Invoice', accessorKey: 'invoice_number', cell: row => <span className="font-mono font-medium text-sm">{row.invoice_number}</span> },
    { header: 'Customer', accessorKey: 'customer_name', cell: row => row.customer_name || 'Walk-in' },
    { header: 'Warehouse', accessorKey: 'warehouse_name' },
    { header: 'Type', cell: row => <StatusBadge status={row.sale_type} /> },
    { header: 'Total (ETB)', cell: row => <span className="font-semibold tabular-nums">ETB {fmt(row.total)}</span> },
    ...(canSeeProfit ? [{ header: 'Profit (ETB)', cell: row => <span className="text-emerald-600 font-medium tabular-nums">ETB {fmt(row.total_profit)}</span> }] : []),
    { header: 'Date', cell: row => row.sale_date ? format(new Date(row.sale_date), 'MMM d, yyyy') : '—' },
    { header: 'Status', cell: row => <StatusBadge status={row.status} /> },
    { header: '', cell: row => (
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); setSelectedSale(row); setView('detail'); }}>
        <Eye className="w-3.5 h-3.5" />
      </Button>
    )},
  ];

  if (view === 'new') return <NewSaleForm onBack={() => setView('list')} />;
  if (view === 'detail' && selectedSale) return (
    <SaleDetail sale={selectedSale} onBack={() => { setView('list'); setSelectedSale(null); }} canSeeProfit={canSeeProfit} />
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Sales" description="Manage invoices and sales"
        actions={<Button onClick={() => setView('new')}><Plus className="w-4 h-4 mr-2" />New Sale</Button>}
      />
      <DataTable columns={columns} data={sales} isLoading={isLoading} />
    </div>
  );
}
