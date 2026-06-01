import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import { format } from 'date-fns';

export default function ActivityLog() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['activity-logs'],
    queryFn: () => base44.entities.ActivityLog.list('-created_date', 200)
  });

  const columns = [
    { header: 'Time', cell: row => format(new Date(row.created_date), 'MMM d, yyyy h:mm a') },
    { header: 'User', accessorKey: 'user_name' },
    { header: 'Module', accessorKey: 'module', cell: row => <span className="font-medium">{row.module}</span> },
    { header: 'Action', accessorKey: 'action', cell: row => (
      <span className="capitalize px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium">
        {row.action}
      </span>
    )},
    { header: 'Description', accessorKey: 'description' },
  ];

  return (
    <div className="space-y-4">
      <PageHeader title="Activity Log" description="Complete audit trail of all system actions" />
      <DataTable columns={columns} data={logs} isLoading={isLoading} pageSize={20} />
    </div>
  );
}