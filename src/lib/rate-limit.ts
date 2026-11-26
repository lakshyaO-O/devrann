import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getAdminFirestore } from '@/firebase/admin';

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface SharedRateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
  unavailable?: boolean;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60_000,
  maxRequests: Number.isSafeInteger(Number(process.env.ADMIN_RATE_LIMIT))
    && Number(process.env.ADMIN_RATE_LIMIT) > 0
    ? Number(process.env.ADMIN_RATE_LIMIT)
    : 60,
};

const store = new Map<string, RateLimitEntry>();

function cleanup(): void {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > DEFAULT_CONFIG.windowMs * 2) {
      store.delete(key);
    }
  }
}

if (typeof setInterval !== 'undefined') {
  setInterval(cleanup, DEFAULT_CONFIG.windowMs);
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return 'unknown';
}

export function checkRateLimit(
  uid: string,
  request: Request,
  config: RateLimitConfig = DEFAULT_CONFIG,
): { allowed: boolean; retryAfterMs: number } {
  const ip = getClientIp(request);
  const now = Date.now();

  const uidKey = `uid:${uid}`;
  const ipKey = `ip:${ip}`;

  for (const key of [uidKey, ipKey]) {
    const entry = store.get(key);
    if (!entry || now - entry.windowStart > config.windowMs) {
      store.set(key, { count: 1, windowStart: now });
    } else if (entry.count >= config.maxRequests) {
      const retryAfterMs = config.windowMs - (now - entry.windowStart);
      return { allowed: false, retryAfterMs };
    } else {
      entry.count++;
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}

export async function checkRateLimitFirestore(
  uid: string,
  action: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
): Promise<SharedRateLimitResult> {
  try {
    if (!Number.isSafeInteger(config.windowMs) || config.windowMs <= 0
      || !Number.isSafeInteger(config.maxRequests) || config.maxRequests <= 0) {
      throw new Error('Invalid shared rate-limit configuration.');
    }
    const db = getAdminFirestore();
    const docId = createHash('sha256').update(`${action}:${uid}`).digest('hex');
    const ref = db.collection('rateLimits').doc(docId);
    const now = Date.now();

    return await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(ref);
      const data = snap.data();
      const windowStart = typeof data?.windowStart === 'number' ? data.windowStart : now;
      const count = data?.windowStart === windowStart && now - windowStart <= config.windowMs
        ? Number(data?.count) || 0
        : 0;
      if (count >= config.maxRequests) {
        return { allowed: false, retryAfterMs: Math.max(1, config.windowMs - (now - windowStart)) };
      }

      transaction.set(ref, {
        action,
        uid,
        count: count + 1,
        windowStart: count === 0 ? now : windowStart,
      });
      return { allowed: true, retryAfterMs: 0 };
    });
  } catch (error) {
    console.error('[RateLimit] Shared Firestore limiter unavailable', error);
    return { allowed: false, retryAfterMs: 0, unavailable: true };
  }
}

export async function enforceSharedRateLimit(
  uid: string,
  action: string,
  config: RateLimitConfig = DEFAULT_CONFIG,
): Promise<NextResponse | null> {
  const result = await checkRateLimitFirestore(uid, action, config);
  if (result.unavailable) return rateLimitResponse(0, true);
  if (!result.allowed) return rateLimitResponse(result.retryAfterMs);
  return null;
}

export function rateLimitResponse(retryAfterMs: number, unavailable = false): NextResponse {
  if (unavailable) {
    return NextResponse.json(
      { error: 'Request protection is temporarily unavailable. Please retry later.', code: 'RATE_LIMIT_UNAVAILABLE' },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: `Rate limit exceeded. Try again in ${Math.ceil(retryAfterMs / 1000)} seconds.` },
    { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
  );
}
