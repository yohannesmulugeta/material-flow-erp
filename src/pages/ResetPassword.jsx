import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Loader2, CheckCircle } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase recovery links include a hash fragment — SDK fires PASSWORD_RECOVERY
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true);
    });
    // Also check if there's already an active session (user clicked link in same browser)
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      setTimeout(() => navigate('/'), 2000);
    } catch (err) {
      setError(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthLayout icon={CheckCircle} title="Password updated" subtitle="Redirecting you to the app…">
        <p className="text-sm text-center text-muted-foreground">Password changed successfully.</p>
      </AuthLayout>
    );
  }

  if (!ready) {
    return (
      <AuthLayout icon={Lock} title="Reset password" subtitle="Verifying your reset link…">
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={Lock} title="Set new password" subtitle="Choose a strong password">
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="password" type="password" autoFocus placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)}
              className="pl-10 h-12" required minLength={8} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="confirm" type="password" placeholder="••••••••"
              value={confirm} onChange={e => setConfirm(e.target.value)}
              className="pl-10 h-12" required minLength={8} />
          </div>
        </div>
        <Button type="submit" className="w-full h-12" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Updating…</> : 'Update password'}
        </Button>
      </form>
    </AuthLayout>
  );
}
