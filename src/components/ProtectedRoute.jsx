import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import PendingApproval from '@/components/PendingApproval';

const Spinner = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
  </div>
);

export default function ProtectedRoute({ unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, isRoleAssigned } = useAuth();

  if (isLoadingAuth || !authChecked) return <Spinner />;
  if (!isAuthenticated) return unauthenticatedElement || <Navigate to="/login" replace />;
  if (!isRoleAssigned) return <PendingApproval />;

  return <Outlet />;
}
