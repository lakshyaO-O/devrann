'use client';

import React, { useMemo } from 'react';
import { initializeFirebase } from './index';
import { FirebaseProvider } from './provider';
import { AccessibilityPreferenceSync } from '@/components/accessibility/AccessibilityPreferenceSync';
import { getFirebaseConfigErrors, isPreviewFirebaseMisconfigured } from './config';

function PreviewFirebaseConfigError({ errors }: { errors: string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="w-full max-w-xl rounded-lg border border-destructive/40 bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Preview environment configuration required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This Preview deployment cannot safely initialize Firebase. Configure an isolated Preview Firebase project before testing.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const services = useMemo(() => {
    return initializeFirebase();
  }, []);
  const previewMisconfigured = isPreviewFirebaseMisconfigured();
  const configErrors = previewMisconfigured ? getFirebaseConfigErrors() : [];

  if (previewMisconfigured) {
    return <PreviewFirebaseConfigError errors={configErrors} />;
  }

  return (
    <FirebaseProvider app={services.app} firestore={services.firestore} auth={services.auth}>
      <AccessibilityPreferenceSync />
      {children}
    </FirebaseProvider>
  );
};
