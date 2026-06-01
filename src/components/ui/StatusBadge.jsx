import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_STYLES = {
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  inactive: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  approved: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  rejected: 'bg-red-500/10 text-red-600 border-red-500/20',
  cancelled: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  in_transit: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  arrived: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  received: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  closed: 'bg-slate-500/10 text-slate-500 border-slate-500/20',
  cash: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  credit: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  damage: 'bg-red-500/10 text-red-600 border-red-500/20',
  loss: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  formal: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  informal: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

export default function StatusBadge({ status, className }) {
  const style = STATUS_STYLES[status] || 'bg-muted text-muted-foreground';
  const label = (status || '').replace(/_/g, ' ');
  
  return (
    <Badge variant="outline" className={cn("capitalize font-medium text-xs", style, className)}>
      {label}
    </Badge>
  );
}