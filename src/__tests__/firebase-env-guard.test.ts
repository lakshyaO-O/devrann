import { afterEach, describe, expect, it } from 'vitest';
import {
  getClientFirebaseConfigErrors,
  getServerFirebaseEnvErrors,
  isPreviewFirebaseMisconfigured,
  KNOWN_PRODUCTION_FIREBASE_PROJECT_ID,
} from '@/lib/firebase-env-guard';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('firebase env guard - server', () => {
  it('rejects missing project id in preview', () => {
    const errors = getServerFirebaseEnvErrors({
      VERCEL_ENV: 'preview',
      FIREBASE_CLIENT_EMAIL: 'svc@example.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    });
    expect(errors).toContain('Missing FIREBASE_PROJECT_ID in Preview');
    expect(errors).toContain('Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID in Preview');
  });

  it('rejects client/server project id mismatch in preview', () => {
    const errors = getServerFirebaseEnvErrors({
      VERCEL_ENV: 'preview',
      FIREBASE_PROJECT_ID: 'preview-project',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'other-project',
      FIREBASE_CLIENT_EMAIL: 'svc@example.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    });
    expect(errors).toContain('Preview Firebase project ID mismatch between client and server');
  });

  it('rejects preview targeting known production project', () => {
    const errors = getServerFirebaseEnvErrors({
      VERCEL_ENV: 'preview',
      FIREBASE_PROJECT_ID: KNOWN_PRODUCTION_FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: KNOWN_PRODUCTION_FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: 'svc@example.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    });
    expect(errors).toContain('Preview Firebase project cannot target the production project');
  });

  it('accepts correct isolated preview project', () => {
    const errors = getServerFirebaseEnvErrors({
      VERCEL_ENV: 'preview',
      FIREBASE_PROJECT_ID: 'devrann-preview-test',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'devrann-preview-test',
      FIREBASE_CLIENT_EMAIL: 'svc@example.iam.gserviceaccount.com',
      FIREBASE_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
    });
    expect(errors).toEqual([]);
  });

  it('allows local development behavior when unconfigured', () => {
    const errors = getServerFirebaseEnvErrors({
      NODE_ENV: 'development',
    });
    expect(errors).toEqual([]);
  });
});

describe('firebase env guard - client', () => {
  it('reports missing public firebase config in preview', () => {
    const errors = getClientFirebaseConfigErrors({}, { VERCEL_ENV: 'preview' });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('detects preview misconfiguration via process env', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.NEXT_PUBLIC_VERCEL_ENV = 'preview';
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    delete process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
    delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    delete process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
    delete process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
    expect(isPreviewFirebaseMisconfigured()).toBe(true);
  });

  it('rejects preview client config targeting production project', () => {
    const errors = getClientFirebaseConfigErrors({
      apiKey: 'a',
      authDomain: 'a',
      projectId: KNOWN_PRODUCTION_FIREBASE_PROJECT_ID,
      storageBucket: 'a',
      messagingSenderId: 'a',
      appId: 'a',
    }, { VERCEL_ENV: 'preview' });
    expect(errors).toContain('Preview Firebase project cannot target the production project');
  });

  it('treats vercel preview hostname as preview runtime', () => {
    const originalWindow = global.window;
    // @ts-expect-error - test shim
    global.window = { location: { hostname: 'devrann-git-feature-lakshyao-os-projects.vercel.app' } };
    expect(isPreviewFirebaseMisconfigured({
      NODE_ENV: 'production',
      VERCEL_ENV: '',
      NEXT_PUBLIC_FIREBASE_API_KEY: 'a',
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'a',
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: KNOWN_PRODUCTION_FIREBASE_PROJECT_ID,
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'a',
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'a',
      NEXT_PUBLIC_FIREBASE_APP_ID: 'a',
    } as any)).toBe(true);
    global.window = originalWindow;
  });
});
