'use client';

import { useEffect } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';

export function AccessibilityPreferenceSync() {
  const { user } = useUser();
  const { data: profile } = useDoc(user ? `users/${user.uid}` : null);

  useEffect(() => {
    const root = document.documentElement;
    if (!user || !profile) {
      root.style.removeProperty('font-size');
      root.classList.remove('high-contrast', 'reduce-motion');
      return;
    }

    const preferences = (profile as Record<string, unknown>).accessibilityPreferences;
    if (!preferences || typeof preferences !== 'object') {
      root.style.removeProperty('font-size');
      root.classList.remove('high-contrast', 'reduce-motion');
      return;
    }

    const value = preferences as Record<string, unknown>;
    const fontSize = value.fontSize;
    if (Number.isInteger(fontSize) && (fontSize as number) >= 12 && (fontSize as number) <= 24) {
      root.style.fontSize = `${fontSize}px`;
    } else {
      root.style.removeProperty('font-size');
    }
    root.classList.toggle('high-contrast', value.highContrast === true);
    root.classList.toggle('reduce-motion', value.reducedMotion === true);
  }, [profile, user]);

  return null;
}
