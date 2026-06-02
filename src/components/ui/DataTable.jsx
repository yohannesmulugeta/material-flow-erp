import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

// Realistic-width skeleton per column index
const SKELETON_WIDTHS = [
  ['w-32', 'w-24', 'w-28', 'w-20', 'w-16'],
  ['w-20', 'w-32', 'w-24', 'w-16', 'w-28'],
  ['w-28', 'w-16', 'w-32', 'w-24', 'w-20'],
  ['w-24', 'w-28', 'w-16', 'w-32', 'w-20'],
  ['w-16', 'w-24', 'w-20', 'w-28', 'w-32'],
];

function SkeletonCell({ rowIndex, colIndex }) {
  const w = SKELETON_WIDTHS[rowIndex % 5][colIndex % 5];
  return (
    <div className={cn('h-3.5 rounded-md skeleton-shimmer', w)} />
  );
}

export default function DataTable({
  columns,
  data,
  isLoading,
  searchable = true,
  pageSize = 15,
  onRowClick,
  emptyMessage = 'No records found',
  emptyIcon,
  emptyAction,
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!search || !searchable) return data || [];
    const q = search.toLowerCase();
    return (data || []).filter(row =>
      columns.some(col => {
        const val = col.accessorKey ? row[col.accessorKey] : '';
        return String(val || '').toLowerCase().includes(q);
      })
    );
  }, [data, search, columns, searchable]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  // Derived empty state message
  const EmptyIcon = emptyIcon || Inbox;
  const emptyTitle = search
    ? `No results for "${search}"`
    : emptyMessage;
  const emptyHint = search
    ? 'Try a different search term or clear the filter.'
    : 'Add your first record to get started.';

  return (
    <div className="space-y-3">
      {/* Search */}
      {searchable && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search records…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            className="pl-9 h-10 text-base"
            aria-label="Search records"
          />
          {search && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => { setSearch(''); setPage(0); }}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border overflow-hidden bg-card shadow-sm animate-fade-in">
        {/* Horizontal scroll with fade hint on mobile */}
        <div className="overflow-x-auto -webkit-overflow-scrolling-touch overscroll-x-contain"
             style={{ WebkitOverflowScrolling: 'touch' }}>
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                // Skeleton rows — varied widths feel realistic
                Array.from({ length: 6 }).map((_, ri) => (
                  <tr key={ri} className="border-b border-border/50 last:border-0">
                    {columns.map((_, ci) => (
                      <td key={ci} className="px-4 py-3.5">
                        <SkeletonCell rowIndex={ri} colIndex={ci} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                // Beautiful empty state
                <tr>
                  <td colSpan={columns.length}>
                    <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-up">
                      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                        <EmptyIcon className="w-7 h-7 text-muted-foreground/50" />
                      </div>
                      <p className="font-semibold text-foreground mb-1">{emptyTitle}</p>
                      <p className="text-sm text-muted-foreground max-w-xs">{emptyHint}</p>
                      {emptyAction && (
                        <div className="mt-4">{emptyAction}</div>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paged.map((row, ri) => (
                  <tr
                    key={row.id || ri}
                    className={cn(
                      'border-b border-border/50 last:border-0 transition-colors duration-150',
                      onRowClick
                        ? 'cursor-pointer hover:bg-primary/4 active:bg-primary/8'
                        : 'hover:bg-muted/30',
                    )}
                    onClick={() => onRowClick?.(row)}
                  >
                    {columns.map((col, ci) => (
                      <td key={ci} className="px-4 py-3 text-sm align-middle">
                        {col.cell ? col.cell(row) : (col.accessorKey ? row[col.accessorKey] : '')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
          <span>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            {/* Touch-target–compliant pagination buttons */}
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 font-medium">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl"
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
