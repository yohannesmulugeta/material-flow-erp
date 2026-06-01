import React from 'react';
import { Clock, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';

export default function PendingApproval() {
  const { logout, user } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Account Pending Approval</h1>
          <p className="text-muted-foreground">
            Your account (<span className="font-medium">{user?.email}</span>) has been
            created and is awaiting administrator approval. You'll be able to access
            the system once an admin assigns your role.
          </p>
        </div>
        <Button variant="outline" onClick={() => logout(true)}>
          <LogOut className="w-4 h-4 mr-2" />
          Sign out
        </Button>
      </div>
    </div>
  );
}
