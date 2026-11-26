import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  fail: false,
  values: new Map<string, Record<string, unknown>>(),
}));

vi.mock('@/firebase/admin', () => ({
  getAdminFirestore: () => {
    if (state.fail) throw new Error('Firestore unavailable');
    return {
      collection: () => ({
        doc: (id: string) => ({ id }),
      }),
      runTransaction: async (operation: (transaction: {
        get: (ref: { id: string }) => Promise<{ data: () => Record<string, unknown> | undefined }>;
        set: (ref: { id: string }, value: Record<string, unknown>) => void;
      }) => Promise<unknown>) => operation({
        get: async (ref) => ({ data: () => state.values.get(ref.id) }),
        set: (ref, value) => { state.values.set(ref.id, value); },
      }),
    };
  },
}));

import { checkRateLimitFirestore, enforceSharedRateLimit } from '@/lib/rate-limit';

describe('shared rate limiting', () => {
  beforeEach(() => {
    state.fail = false;
    state.values.clear();
  });

  it('uses the shared transaction counter and distinguishes an actual rejection', async () => {
    const config = { windowMs: 60_000, maxRequests: 1 };
    expect(await checkRateLimitFirestore('alice', 'judge', config)).toMatchObject({ allowed: true });
    const limited = await checkRateLimitFirestore('alice', 'judge', config);
    expect(limited.allowed).toBe(false);
    expect(limited).not.toHaveProperty('unavailable');
    const response = await enforceSharedRateLimit('alice', 'judge', config);
    expect(response?.status).toBe(429);
  });

  it('fails closed with a service error when the shared store is unavailable', async () => {
    state.fail = true;
    const result = await checkRateLimitFirestore('alice', 'ai', { windowMs: 1000, maxRequests: 1 });
    expect(result).toMatchObject({ allowed: false, unavailable: true });
    const response = await enforceSharedRateLimit('alice', 'ai', { windowMs: 1000, maxRequests: 1 });
    expect(response?.status).toBe(503);
  });
});
