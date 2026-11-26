import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  uid: 'bob',
  referredBy: 'alice',
  update: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceSharedRateLimit: vi.fn(async () => null),
}));

vi.mock('@/firebase/admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: mocks.uid }) }),
  getAdminFirestore: () => ({
    collection: (collection: string) => ({
      doc: (id: string) => ({ path: `${collection}/${id}` }),
    }),
    runTransaction: async (operation: (tx: {
      get: (ref: { path: string }) => Promise<{ exists: boolean; data: () => Record<string, unknown> }>;
      update: typeof mocks.update;
      set: typeof mocks.set;
    }) => Promise<unknown>) => operation({
      get: async (ref) => {
        if (ref.path === 'referrals/DR-EXISTING') {
          return { exists: true, data: () => ({ userId: 'alice' }) };
        }
        return {
          exists: true,
          data: () => ({
            banned: false,
            ...(ref.path === 'users/bob' && mocks.referredBy ? { referredBy: mocks.referredBy } : {}),
          }),
        };
      },
      update: mocks.update,
      set: mocks.set,
    }),
  }),
}));

import { POST } from '@/app/api/referrals/apply/route';

describe('referral reward API', () => {
  beforeEach(() => {
    mocks.uid = 'bob';
    mocks.referredBy = 'alice';
    mocks.update.mockClear();
    mocks.set.mockClear();
  });

  it('does not award referral rewards more than once to an account', async () => {
    const request = new NextRequest('http://localhost/api/referrals/apply', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'DR-EXISTING' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('rejects applying your own referral code', async () => {
    mocks.uid = 'alice';
    mocks.referredBy = '';
    const request = new NextRequest('http://localhost/api/referrals/apply', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'DR-EXISTING' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
