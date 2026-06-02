import React from 'react';
import { cn } from '@/lib/utils';
import { ArrowUpRight } from 'lucide-react';

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
  className,
  iconClassName,
  onClick,
  color = 'primary',
}) {
  const colorMap = {
    primary: { bg: 'bg-primary/10', text: 'text-primary', border: 'hover:border-primary/40' },
    amber:   { bg: 'bg-amber-500/10', text: 'text-amber-600', border: 'hover:border-amber-400/40' },
    red:     { bg: 'bg-red-500/10', text: 'text-red-600', border: 'hover:border-red-400/40' },
    green:   { bg: 'bg-emerald-500/10', text: 'text-emerald-600', border: 'hover:border-emerald-400/40' },
    purple:  { bg: 'bg-purple-500/10', text: 'text-purple-600', border: 'hover:border-purple-400/40' },
  };
  const c = colorMap[color] || colorMap.primary;

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); } : undefined}
      onClick={onClick}
      className={cn(
        // Base
        'bg-card rounded-2xl border border-border p-4 relative overflow-hidden select-none',
        // Touch target: min 44px height is guaranteed by content, but enforce anyway
        'min-h-[88px]',
        // Transitions — spring physics, GPU only
        'transition-[transform,box-shadow,border-color]',
        'duration-300',
        // Clickable card spring lift
        onClick && [
          'cursor-pointer',
          c.border,
          'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/8',
          'active:scale-[0.97] active:translate-y-0 active:shadow-none',
          'active:duration-75',
        ],
        className,
      )}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider leading-none">
            {title}
          </p>
          {/* value: break-all so long ETB numbers never overflow */}
          <p className="text-xl font-bold text-foreground leading-tight break-all tabular-nums">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
          {trend && (
            <p className={cn('text-xs font-medium flex items-center gap-0.5', trendUp ? 'text-emerald-600' : 'text-red-500')}>
              <span>{trend}</span>
            </p>
          )}
        </div>

        {Icon && (
          <div className={cn(
            'p-2.5 rounded-xl flex-shrink-0 transition-transform duration-300',
            c.bg,
            onClick && 'group-hover:scale-110',
            iconClassName,
          )}>
            <Icon className={cn('w-5 h-5', c.text)} />
          </div>
        )}
      </div>

      {/* Subtle "drill-down" arrow — only for clickable cards */}
      {onClick && (
        <ArrowUpRight className="absolute bottom-3 right-3 w-3.5 h-3.5 text-muted-foreground/30 transition-all duration-200 group-hover:text-muted-foreground/70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      )}
    </div>
  );
}
