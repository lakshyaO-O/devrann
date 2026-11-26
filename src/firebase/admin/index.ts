import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getServerFirebaseEnvErrors } from '@/lib/firebase-env-guard';

let adminInitialized = false;
let lastInitError: string | null = null;

type ValidationError = { message: string; variable?: string };

function validateEnv(): ValidationError[] {
  const errors: ValidationError[] = [];

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  const guardErrors = getServerFirebaseEnvErrors({
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  });

  for (const message of guardErrors) {
    errors.push({ message });
  }

  if (!projectId) {
    errors.push({ message: 'Missing FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)', variable: 'FIREBASE_PROJECT_ID' });
  }

  if (!clientEmail) {
    errors.push({ message: 'Missing FIREBASE_CLIENT_EMAIL', variable: 'FIREBASE_CLIENT_EMAIL' });
  } else if (!clientEmail.includes('@') || !clientEmail.includes('.')) {
    errors.push({ message: 'Invalid FIREBASE_CLIENT_EMAIL format', variable: 'FIREBASE_CLIENT_EMAIL' });
  }

  if (!privateKey) {
    errors.push({ message: 'Missing FIREBASE_PRIVATE_KEY', variable: 'FIREBASE_PRIVATE_KEY' });
  } else if (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----')) {
    errors.push({ message: 'Invalid FIREBASE_PRIVATE_KEY format', variable: 'FIREBASE_PRIVATE_KEY' });
  }

  const unique = new Map<string, ValidationError>();
  for (const e of errors) unique.set(e.message, e);
  return Array.from(unique.values());
}

function getProjectId(): string {
  return process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '';
}

function logErrors(errors: ValidationError[]): void {
  for (const err of errors) {
    console.error(`[Firebase Admin] ${err.message}`);
  }
}

export function initializeAdmin(): boolean {
  if (adminInitialized) return true;

  const errors = validateEnv();

  if (errors.length > 0) {
    lastInitError = errors.map((e) => e.message).join('; ');
    logErrors(errors);
    console.warn('[Firebase Admin] Admin features disabled');
    return false;
  }

  const projectId = getProjectId();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY!;

  try {
    if (getApps().length === 0) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    }
    adminInitialized = true;
    lastInitError = null;
    return true;
  } catch (err: any) {
    lastInitError = err?.message ? 'Firebase Admin initialization failed' : 'Firebase Admin initialization failed';
    console.error('[Firebase Admin] Initialization failed');
    return false;
  }
}

export function getAdminInitError(): string | null {
  if (adminInitialized) return null;
  if (lastInitError) return lastInitError;
  const errors = validateEnv();
  return errors.length ? errors.map((e) => e.message).join('; ') : null;
}

export function getAdminAuth() {
  const initialized = initializeAdmin();
  if (!initialized) {
    throw new Error('Firebase Admin Auth unavailable: Admin SDK failed to initialize');
  }
  return getAuth();
}

export function getAdminFirestore() {
  const initialized = initializeAdmin();
  if (!initialized) {
    throw new Error('Firebase Admin Firestore unavailable: Admin SDK failed to initialize');
  }
  return getFirestore();
}
