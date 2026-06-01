import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await base44.auth.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthLayout icon={CheckCircle} title="Check your email" subtitle="Password reset link sent">
        <p className="text-sm text-center text-muted-foreground mb-6">
          We sent a reset link to <strong>{email}</strong>. Check your inbox and follow the link.
        </p>
        <Link to="/login">
          <Button variant="outline" className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to login
          </Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={Mail} title="Forgot password" subtitle="Enter your email to reset your password"
      footer={<Link to="/login" className="text-primary font-medium hover:underline flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />Back to login</Link>}>
      {error && <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input id="email" type="email" autoFocus placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} className="pl-10 h-12" required />
          </div>
        </div>
        <Button type="submit" className="w-full h-12" disabled={loading}>
          {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</> : 'Send reset link'}
        </Button>
      </form>
    </AuthLayout>
  );
}
