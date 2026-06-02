import React from 'react';
import { Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';

export default function PendingApproval() {
  const { logout, user } = useAuth();
  return (
    <div className="min-h-dvh flex items-center justify-center bg-background p-4 pb-safe">
      <div className="max-w-sm w-full text-center space-y-5 animate-scale-in">
        {/* Icon with pulse ring */}
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-full bg-amber-100 animate-ping opacity-30" />
          <div className="relative w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center">
            <Clock className="w-9 h-9 text-amber-600" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Pending Approval</h1>
          <p className="text-muted-foreground leading-relaxed">
            Your account (<span className="font-medium text-foreground">{user?.email}</span>) is
            waiting for an administrator to assign your role. You'll get full access
            once they approve you.
          </p>
        </div>

        <div className="bg-muted/50 rounded-2xl p-4 text-sm text-muted-foreground">
          Contact your system administrator and ask them to assign your role in
          the <strong>User Management</strong> page.
        </div>

        <Button variant="outline" className="w-full" onClick={() => logout(true)}>
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
