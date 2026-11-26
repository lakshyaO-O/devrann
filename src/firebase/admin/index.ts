import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getServerFirebaseEnvErrors } from '@/lib/firebase-env-guard';

let adminInitialized = false;
let lastInitError: string | null = null;

type ValidationError = { message: string; variable?: string };

function isPreviewEnv(): boolean {
  return process.env.VERCEL_ENV === 'preview';
}

function getAdminCredentials() {
  if (isPreviewEnv()) {
    return {
      projectId: process.env.PREVIEW_FIREBASE_PROJECT_ID || '',
      clientEmail: process.env.PREVIEW_FIREBASE_CLIENT_EMAIL || '',
      privateKey: process.env.PREVIEW_FIREBASE_PRIVATE_KEY || '',
    };
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: process.env.FIREBASE_PRIVATE_KEY || '',
  };
}

function validateEnv(): ValidationError[] {
  const errors: ValidationError[] = [];
  const { projectId, clientEmail, privateKey } = getAdminCredentials();

  const guardErrors = getServerFirebaseEnvErrors({
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
    PREVIEW_FIREBASE_PROJECT_ID: process.env.PREVIEW_FIREBASE_PROJECT_ID,
    PREVIEW_FIREBASE_CLIENT_EMAIL: process.env.PREVIEW_FIREBASE_CLIENT_EMAIL,
    PREVIEW_FIREBASE_PRIVATE_KEY: process.env.PREVIEW_FIREBASE_PRIVATE_KEY,
  });

  for (const message of guardErrors) {
    errors.push({ message });
  }

  if (isPreviewEnv()) {
    if (!projectId) errors.push({ message: 'Missing PREVIEW_FIREBASE_PROJECT_ID', variable: 'PREVIEW_FIREBASE_PROJECT_ID' });
    if (!clientEmail) errors.push({ message: 'Missing PREVIEW_FIREBASE_CLIENT_EMAIL', variable: 'PREVIEW_FIREBASE_CLIENT_EMAIL' });
    if (!privateKey) errors.push({ message: 'Missing PREVIEW_FIREBASE_PRIVATE_KEY', variable: 'PREVIEW_FIREBASE_PRIVATE_KEY' });
  } else {
    if (!projectId) errors.push({ message: 'Missing FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID)', variable: 'FIREBASE_PROJECT_ID' });
    if (!clientEmail) errors.push({ message: 'Missing FIREBASE_CLIENT_EMAIL', variable: 'FIREBASE_CLIENT_EMAIL' });
    if (!privateKey) errors.push({ message: 'Missing FIREBASE_PRIVATE_KEY', variable: 'FIREBASE_PRIVATE_KEY' });
  }

  if (clientEmail && (!clientEmail.includes('@') || !clientEmail.includes('.'))) {
    errors.push({ message: `Invalid ${isPreviewEnv() ? 'PREVIEW_FIREBASE_CLIENT_EMAIL' : 'FIREBASE_CLIENT_EMAIL'} format` });
  }
  if (privateKey && (!privateKey.includes('-----BEGIN PRIVATE KEY-----') || !privateKey.includes('-----END PRIVATE KEY-----'))) {
    errors.push({ message: `Invalid ${isPreviewEnv() ? 'PREVIEW_FIREBASE_PRIVATE_KEY' : 'FIREBASE_PRIVATE_KEY'} format` });
  }

  const unique = new Map<string, ValidationError>();
  for (const e of errors) unique.set(e.message, e);
  return Array.from(unique.values());
}

function getProjectId(): string {
  return getAdminCredentials().projectId;
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

  const { projectId, clientEmail, privateKey } = getAdminCredentials();

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
