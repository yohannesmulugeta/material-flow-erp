import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Bell, AlertTriangle, Clock, TrendingDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function NotificationCenter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { data: inventory = [] } = useQuery({ queryKey: ['inventory'], queryFn: () => base44.entities.InventoryStock.list() });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: () => base44.entities.Product.list() });
  const { data: transfers = [] } = useQuery({ queryKey: ['transfers-pending'], queryFn: () => base44.entities.Transfer.filter({ status: 'pending' }) });
  const { data: damages = [] } = useQuery({ queryKey: ['damages-pending'], queryFn: () => base44.entities.DamageRecord.filter({ status: 'pending' }) });
  const { data: adjustments = [] } = useQuery({ queryKey: ['adjustments-pending'], queryFn: () => base44.entities.StockAdjustment.filter({ status: 'pending' }) });
  const { data: returns = [] } = useQuery({ queryKey: ['returns-pending'], queryFn: () => base44.entities.SalesReturn.filter({ status: 'pending' }) });
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: () => base44.entities.Customer.list() });

  const lowStock = products.filter(p => {
    if (p.status !== 'active' || !p.min_stock_level) return false;
    const qty = inventory.filter(i => i.product_id === p.id).reduce((s, i) => s + (i.quantity || 0), 0);
    return qty <= p.min_stock_level;
  });

  const negativeStock = inventory.filter(i => (i.quantity || 0) < 0);
  const overdueCredit = customers.filter(c => (c.balance || 0) > (c.credit_limit || 0) && c.credit_limit > 0);
  const pendingApprovals = transfers.length + damages.length + adjustments.length + returns.length;

  const notifications = [
    ...lowStock.map(p => ({
      id: `low-${p.id}`, type: 'warning', icon: TrendingDown,
      title: `Low stock: ${p.name}`,
      detail: `Below minimum level (${p.min_stock_level})`,
      action: () => { navigate('/inventory'); setOpen(false); },
    })),
    ...negativeStock.map(i => ({
      id: `neg-${i.id}`, type: 'error', icon: AlertTriangle,
      title: `Negative stock: ${i.product_name}`,
      detail: `${i.warehouse_name}: ${i.quantity} units`,
      action: () => { navigate('/inventory'); setOpen(false); },
    })),
    ...(pendingApprovals > 0 ? [{
      id: 'approvals', type: 'info', icon: Clock,
      title: `${pendingApprovals} pending approval${pendingApprovals > 1 ? 's' : ''}`,
      detail: `${transfers.length} transfers, ${damages.length} damages, ${returns.length} returns, ${adjustments.length} adjustments`,
      action: () => { navigate('/approvals'); setOpen(false); },
    }] : []),
    ...overdueCredit.map(c => ({
      id: `credit-${c.id}`, type: 'warning', icon: AlertTriangle,
      title: `Over credit limit: ${c.name}`,
      detail: `Balance ETB ${c.balance?.toLocaleString()} / Limit ETB ${c.credit_limit?.toLocaleString()}`,
      action: () => { navigate('/customers'); setOpen(false); },
    })),
  ];

  const count = notifications.length;

  return (
    <div className="relative">
      <Button variant="ghost" size="icon" className="relative h-9 w-9" onClick={() => setOpen(o => !o)}>
        <Bell className="w-4.5 h-4.5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-[10px] text-white font-bold flex items-center justify-center">
            {count > 9 ? '9+' : count}
          </span>
        )}
      </Button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-80 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-semibold text-sm">Notifications</h3>
              <div className="flex items-center gap-2">
                {count > 0 && <span className="text-xs text-muted-foreground">{count} alert{count > 1 ? 's' : ''}</span>}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}><X className="w-3.5 h-3.5" /></Button>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-border">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">All clear — no alerts</p>
                </div>
              ) : (
                notifications.map(n => (
                  <button key={n.id} className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors" onClick={n.action}>
                    <div className="flex items-start gap-3">
                      <div className={cn('mt-0.5 p-1 rounded-md flex-shrink-0',
                        n.type === 'error' ? 'bg-destructive/10' :
                        n.type === 'warning' ? 'bg-amber-500/10' : 'bg-blue-500/10'
                      )}>
                        <n.icon className={cn('w-3.5 h-3.5',
                          n.type === 'error' ? 'text-destructive' :
                          n.type === 'warning' ? 'text-amber-600' : 'text-blue-600'
                        )} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{n.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.detail}</p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
