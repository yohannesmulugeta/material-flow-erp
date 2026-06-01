import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import PendingApproval from '@/components/PendingApproval';

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  </div>
);

export default function ProtectedRoute({ unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, isRoleAssigned } = useAuth();

  if (isLoadingAuth || !authChecked) return <Spinner />;
  if (!isAuthenticated) return unauthenticatedElement || <Navigate to="/login" replace />;
  if (!isRoleAssigned) return <PendingApproval />;

  return <Outlet />;
}
