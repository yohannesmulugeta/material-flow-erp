import React from 'react';
import { format } from 'date-fns';
import { Clock, User } from 'lucide-react';

/**
 * Reusable audit trail footer for any record detail view.
 * Shows created_at, created_by (name), updated_at, updated_by.
 */
export default function AuditTrail({ record, className = '' }) {
  if (!record) return null;
  const createdAt = record.created_at || record.created_date;
  const updatedAt = record.updated_at || record.updated_date;

  const fmt = (d) => {
    try { return format(new Date(d), 'MMM d, yyyy h:mm a'); }
    catch { return d; }
  };

  return (
    <div className={`border-t border-border pt-3 mt-4 text-xs text-muted-foreground space-y-1 ${className}`}>
      {createdAt && (
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          <span>Created {fmt(createdAt)}</span>
        </div>
      )}
      {updatedAt && updatedAt !== createdAt && (
        <div className="flex items-center gap-1.5">
          <User className="w-3 h-3" />
          <span>Last updated {fmt(updatedAt)}</span>
        </div>
      )}
    </div>
  );
}
