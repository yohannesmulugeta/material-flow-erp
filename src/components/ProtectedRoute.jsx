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

const ErrorScreen = ({ message }) => (
  <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
    <div className="max-w-sm text-center space-y-3">
      <div className="text-4xl">⚠️</div>
      <h2 className="font-semibold text-lg">Connection error</h2>
      <p className="text-sm text-muted-foreground">{message}</p>
      <p className="text-xs text-muted-foreground">
        Make sure the dev server has the correct <code>.env.local</code> and was restarted after changes.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
      >
        Retry
      </button>
    </div>
  </div>
);

export default function ProtectedRoute({ unauthenticatedElement }) {
  const { isAuthenticated, isLoadingAuth, authChecked, isRoleAssigned, authError } = useAuth();

  if (isLoadingAuth || !authChecked) return <Spinner />;

  if (authError?.type === 'timeout') {
    return <ErrorScreen message={authError.message} />;
  }

  if (!isAuthenticated) return unauthenticatedElement || <Navigate to="/login" replace />;
  if (!isRoleAssigned) return <PendingApproval />;

  return <Outlet />;
}
