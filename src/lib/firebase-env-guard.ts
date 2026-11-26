export const KNOWN_PRODUCTION_FIREBASE_PROJECT_ID = 'codexarena-4990f';

export type FirebaseEnvName =
  | 'development'
  | 'preview'
  | 'production'
  | 'test'
  | string
  | undefined;

export interface ServerFirebaseEnvInput {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
}

export interface ClientFirebaseEnvInput {
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  NEXT_PUBLIC_VERCEL_ENV?: string;
}

export interface FirebasePublicConfigInput {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

function normalize(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getRuntimeEnv(input: ClientFirebaseEnvInput): string {
  return normalize(input.NEXT_PUBLIC_VERCEL_ENV) || normalize(input.VERCEL_ENV) || normalize(input.NODE_ENV) || '';
}

export function isPreviewRuntime(input: ClientFirebaseEnvInput): boolean {
  if (getRuntimeEnv(input) === 'preview') return true;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.endsWith('.vercel.app') && host !== 'devrann.vercel.app') return true;
  }
  return false;
}

export function isLocalDevelopmentRuntime(input: ClientFirebaseEnvInput): boolean {
  const env = getRuntimeEnv(input);
  return env === 'development' || env === 'test' || env === '';
}

export function getPublicFirebaseConfigErrors(config: FirebasePublicConfigInput): string[] {
  const errors: string[] = [];
  if (!normalize(config.apiKey)) errors.push('Missing NEXT_PUBLIC_FIREBASE_API_KEY');
  if (!normalize(config.authDomain)) errors.push('Missing NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN');
  if (!normalize(config.projectId)) errors.push('Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID');
  if (!normalize(config.storageBucket)) errors.push('Missing NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET');
  if (!normalize(config.messagingSenderId)) errors.push('Missing NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
  if (!normalize(config.appId)) errors.push('Missing NEXT_PUBLIC_FIREBASE_APP_ID');
  return errors;
}

export function getClientFirebaseConfigErrors(
  config: FirebasePublicConfigInput,
  input: ClientFirebaseEnvInput = {},
): string[] {
  const errors = getPublicFirebaseConfigErrors(config);
  const projectId = normalize(config.projectId);
  if (isPreviewRuntime(input)) {
    if (projectId && projectId === KNOWN_PRODUCTION_FIREBASE_PROJECT_ID) {
      errors.push('Preview Firebase project cannot target the production project');
    }
  }
  return errors;
}

export function isPreviewFirebaseMisconfigured(
  input: ClientFirebaseEnvInput & FirebasePublicConfigInput & Record<string, string | undefined> = process.env as ClientFirebaseEnvInput & FirebasePublicConfigInput & Record<string, string | undefined>,
): boolean {
  const runtimeInput: ClientFirebaseEnvInput = {
    NODE_ENV: input.NODE_ENV,
    VERCEL_ENV: input.VERCEL_ENV,
    NEXT_PUBLIC_VERCEL_ENV: input.NEXT_PUBLIC_VERCEL_ENV,
  };
  if (!isPreviewRuntime(runtimeInput)) return false;
  const config: FirebasePublicConfigInput = {
    apiKey: input.apiKey ?? input.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: input.authDomain ?? input.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: input.projectId ?? input.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: input.storageBucket ?? input.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: input.messagingSenderId ?? input.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: input.appId ?? input.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  return getClientFirebaseConfigErrors(config, runtimeInput).length > 0;
}

export function getServerFirebaseEnvErrors(input: ServerFirebaseEnvInput): string[] {
  const errors: string[] = [];
  const vercelEnv = normalize(input.VERCEL_ENV);
  const nodeEnv = normalize(input.NODE_ENV);
  const projectId = normalize(input.FIREBASE_PROJECT_ID);
  const publicProjectId = normalize(input.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const clientEmail = normalize(input.FIREBASE_CLIENT_EMAIL);
  const privateKey = normalize(input.FIREBASE_PRIVATE_KEY);
  const isPreview = vercelEnv === 'preview';
  const isProduction = vercelEnv === 'production' || (!vercelEnv && nodeEnv === 'production');

  if (isPreview) {
    if (!projectId) errors.push('Missing FIREBASE_PROJECT_ID in Preview');
    if (!publicProjectId) errors.push('Missing NEXT_PUBLIC_FIREBASE_PROJECT_ID in Preview');
    if (projectId && publicProjectId && projectId !== publicProjectId) {
      errors.push('Preview Firebase project ID mismatch between client and server');
    }
    const effectiveProjectId = projectId || publicProjectId;
    if (effectiveProjectId === KNOWN_PRODUCTION_FIREBASE_PROJECT_ID) {
      errors.push('Preview Firebase project cannot target the production project');
    }
  }

  if (isProduction || isPreview) {
    if (!projectId && !publicProjectId) errors.push('Missing Firebase project ID');
  } else {
    // Local/dev/test: preserve existing flexibility, but if partially configured validate basics.
    if (!projectId && !publicProjectId && (clientEmail || privateKey)) {
      errors.push('Missing Firebase project ID');
    }
  }

  if (clientEmail && (!clientEmail.includes('@') || !clientEmail.includes('.'))) {
    errors.push('Invalid FIREBASE_CLIENT_EMAIL format');
  }
  if (privateKey) {
    if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
      errors.push('Invalid FIREBASE_PRIVATE_KEY format');
    } else if (!privateKey.includes('-----END PRIVATE KEY-----')) {
      errors.push('Invalid FIREBASE_PRIVATE_KEY format');
    }
  }

  return errors;
}

export function shouldBlockFirebaseAdminInit(input: ServerFirebaseEnvInput): boolean {
  return getServerFirebaseEnvErrors(input).length > 0;
}
