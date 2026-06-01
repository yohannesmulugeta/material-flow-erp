import React from 'react';
import { cn } from '@/lib/utils';

export default function StatCard({ title, value, subtitle, icon: Icon, trend, trendUp, className, iconClassName, onClick }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card rounded-xl border border-border p-4 relative overflow-hidden transition-all",
        onClick && "cursor-pointer hover:shadow-md hover:border-primary/30 active:scale-[0.98]",
        !onClick && "hover:shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate">{title}</p>
          <p className="text-xl font-bold text-foreground leading-tight break-all">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          {trend && (
            <p className={cn("text-xs font-medium", trendUp ? "text-emerald-600" : "text-red-500")}>
              {trend}
            </p>
          )}
        </div>
        {Icon && (
          <div className={cn("p-2.5 rounded-xl bg-primary/10 flex-shrink-0", iconClassName)}>
            <Icon className="w-5 h-5 text-primary" />
          </div>
        )}
      </div>
      {onClick && (
        <div className="absolute bottom-2 right-3 text-[10px] text-muted-foreground/50 font-medium">click to view →</div>
      )}
    </div>
  );
}