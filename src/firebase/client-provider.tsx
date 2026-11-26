'use client';

import React, { useMemo } from 'react';
import { initializeFirebase } from './index';
import { FirebaseProvider } from './provider';
import { AccessibilityPreferenceSync } from '@/components/accessibility/AccessibilityPreferenceSync';

export function FirebaseClientProvider({ children }: { children: React.ReactNode }) {
  const services = useMemo(() => {
    return initializeFirebase();
  }, []);

  return (
    <FirebaseProvider app={services.app} firestore={services.firestore} auth={services.auth}>
      <AccessibilityPreferenceSync />
      {children}
    </FirebaseProvider>
  );
};
