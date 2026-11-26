'use client';

import React, { useEffect, useState } from 'react';
import { reload, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/firebase/provider';
import { useUser } from '@/firebase/auth/use-user';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle, KeyRound, Loader2, Mail, Shield, ShieldCheck, XCircle,
} from 'lucide-react';

const PROVIDER_NAMES: Record<string, string> = {
  'google.com': 'Google',
  'password': 'Email and password',
  'github.com': 'GitHub',
  'apple.com': 'Apple',
  'microsoft.com': 'Microsoft',
  'facebook.com': 'Facebook',
};

export function SecuritySettings() {
  const { user } = useUser();
  const auth = useAuth();
  const { toast } = useToast();
  const [sendingVerification, setSendingVerification] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);
  const [emailVerified, setEmailVerified] = useState(user?.emailVerified ?? false);
  const connectedProviders = [...new Set(user?.providerData.map((provider) =>
    PROVIDER_NAMES[provider.providerId] || provider.providerId,
  ) ?? [])];
  const hasPasswordProvider = user?.providerData.some((provider) => provider.providerId === 'password') ?? false;

  useEffect(() => {
    setEmailVerified(user?.emailVerified ?? false);
  }, [user?.emailVerified]);

  const handleSendVerification = async () => {
    if (!user || sendingVerification) return;
    setSendingVerification(true);
    try {
      await sendEmailVerification(user);
      toast({ title: 'Verification email sent', description: 'Check your inbox and follow the verification link.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Unable to send verification email',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSendingVerification(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!auth || !user?.email || sendingReset) return;
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, user.email);
      toast({ title: 'Password reset email sent', description: `Follow the secure reset link sent to ${user.email}.` });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Unable to send password reset',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setSendingReset(false);
    }
  };

  const refreshVerificationStatus = async () => {
    if (!user) return;
    try {
      await reload(user);
      setEmailVerified(user.emailVerified);
      toast({ title: user.emailVerified ? 'Email verified' : 'Verification not detected', description: user.emailVerified ? 'Your account email is verified.' : 'After verifying, refresh this status again.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Unable to refresh account status',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-headline font-bold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Sign-in methods
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectedProviders.length ? (
            <div className="flex flex-wrap gap-2">
              {connectedProviders.map((provider) => (
                <Badge key={provider} variant="outline">{provider}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No connected sign-in provider was reported by Firebase.</p>
          )}
          {hasPasswordProvider && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border pt-4">
              <div>
                <p className="text-sm font-medium">Password</p>
                <p className="text-xs text-muted-foreground">Send a secure password reset link to your account email.</p>
              </div>
              <Button variant="outline" onClick={() => void handlePasswordReset()} disabled={sendingReset || !user?.email} className="gap-2">
                {sendingReset ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Reset password
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Provider linking and unlinking are not enabled here; changing sign-in methods requires a verified account flow.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-headline font-bold flex items-center gap-2">
            <Mail className="w-5 h-5 text-primary" />
            Email verification
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {emailVerified
              ? <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
              : <XCircle className="w-5 h-5 text-destructive shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user?.email || 'No email on this account'}</p>
              <p className="text-xs text-muted-foreground">{emailVerified ? 'Verified' : 'Not verified'}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!emailVerified && (
              <Button variant="outline" size="sm" onClick={() => void handleSendVerification()} disabled={sendingVerification || !user?.email} className="gap-2">
                {sendingVerification ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                Resend link
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => void refreshVerificationStatus()}>
              Refresh status
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-headline font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Session security
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            DevRann does not currently expose a verified device-session inventory or remote session revocation control. Sign out from shared devices, and use your identity provider’s security page to review account sessions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
