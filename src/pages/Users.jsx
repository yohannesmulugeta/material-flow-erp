import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import { Shield, UserCheck, UserX, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { ROLE_LABELS } from '@/lib/permissions';
import { logActivity } from '@/lib/activityLogger';

const ROLES = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'manager', label: 'Manager' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'warehouse_staff', label: 'Warehouse Staff' },
  { value: 'sales_staff', label: 'Sales Staff' },
  { value: 'unassigned', label: 'Unassigned' },
];

const ROLE_COLORS = {
  super_admin: 'bg-purple-100 text-purple-800',
  manager: 'bg-blue-100 text-blue-800',
  accountant: 'bg-green-100 text-green-800',
  warehouse_staff: 'bg-amber-100 text-amber-800',
  sales_staff: 'bg-sky-100 text-sky-800',
  unassigned: 'bg-gray-100 text-gray-600',
};

export default function Users() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const [saving, setSaving] = useState({});

  const { data: profiles = [], isLoading, refetch } = useQuery({
    queryKey: ['profiles-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role, userName }) => {
      setSaving(s => ({ ...s, [userId]: true }));
      const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
      if (error) throw error;
      await logActivity({ module: 'Users', action: 'role_changed', entityType: 'Profile', entityId: userId, description: `Changed role of ${userName} to ${role}` });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['profiles-all'] }); },
    onSettled: (_, __, { userId }) => setSaving(s => ({ ...s, [userId]: false })),
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ userId, currentStatus, userName }) => {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', userId);
      if (error) throw error;
      await logActivity({ module: 'Users', action: 'status_changed', entityType: 'Profile', entityId: userId, description: `${newStatus === 'active' ? 'Activated' : 'Deactivated'} user: ${userName}` });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profiles-all'] }),
  });

  const columns = [
    {
      header: 'User',
      cell: row => (
        <div>
          <p className="font-medium">{row.full_name || row.email?.split('@')[0]}</p>
          <p className="text-xs text-muted-foreground">{row.email}</p>
        </div>
      )
    },
    {
      header: 'Role',
      cell: row => {
        const isCurrentUser = row.id === currentUser?.id;
        if (isCurrentUser) {
          return <Badge className={`text-xs ${ROLE_COLORS[row.role] || ROLE_COLORS.unassigned}`}>{ROLE_LABELS[row.role] || row.role}</Badge>;
        }
        return (
          <Select
            value={row.role}
            onValueChange={role => updateRole.mutate({ userId: row.id, role, userName: row.full_name || row.email })}
            disabled={!!saving[row.id]}
          >
            <SelectTrigger className="w-44 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map(r => <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>)}
            </SelectContent>
          </Select>
        );
      }
    },
    {
      header: 'Status',
      cell: row => (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${row.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
          {row.status === 'active' ? '● Active' : '○ Inactive'}
        </span>
      )
    },
    {
      header: 'Joined',
      cell: row => row.created_at ? format(new Date(row.created_at), 'MMM d, yyyy') : '—'
    },
    {
      header: 'Actions',
      cell: row => {
        const isCurrentUser = row.id === currentUser?.id;
        if (isCurrentUser) return <span className="text-xs text-muted-foreground">You</span>;
        return (
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 text-xs ${row.status === 'active' ? 'text-destructive hover:text-destructive' : 'text-emerald-600 hover:text-emerald-600'}`}
            onClick={() => toggleStatus.mutate({ userId: row.id, currentStatus: row.status, userName: row.full_name || row.email })}
            disabled={toggleStatus.isPending}
          >
            {row.status === 'active' ? <><UserX className="w-3.5 h-3.5 mr-1" />Deactivate</> : <><UserCheck className="w-3.5 h-3.5 mr-1" />Activate</>}
          </Button>
        );
      }
    },
  ];

  const unassigned = profiles.filter(p => p.role === 'unassigned').length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="User Management"
        description={`${profiles.length} users${unassigned > 0 ? ` · ${unassigned} pending approval` : ''}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1.5" />Refresh
          </Button>
        }
      />

      {unassigned > 0 && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <Shield className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">{unassigned} user{unassigned > 1 ? 's' : ''} waiting for role assignment</p>
            <p className="text-xs text-amber-700">Assign a role to grant access. Unassigned users see the "Pending Approval" screen.</p>
          </div>
        </div>
      )}

      <DataTable columns={columns} data={profiles} isLoading={isLoading} />
    </div>
  );
}
