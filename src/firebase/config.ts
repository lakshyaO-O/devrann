'use client';

import { getClientFirebaseConfigErrors, isPreviewRuntime } from '@/lib/firebase-env-guard';

export const firebaseConfig: Record<string, string | undefined> = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfigErrors().length === 0;
}

export function getFirebaseConfigErrors(): string[] {
  return getClientFirebaseConfigErrors(firebaseConfig, {
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  });
}

export function isPreviewFirebaseMisconfigured(): boolean {
  return isPreviewRuntime({
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  }) && getFirebaseConfigErrors().length > 0;
}
