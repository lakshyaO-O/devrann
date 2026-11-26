import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  enforceSharedRateLimit: vi.fn(async () => null),
}));

vi.mock('@/firebase/admin', () => {
  const countDocs = (value: number) => ({
    data: () => ({ count: value }),
  });
  const problemCollection = () => {
    const query: any = {
      where: () => query,
      count: () => ({ get: async () => countDocs(2) }),
    };
    return query;
  };
  return {
    getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'alice' }) }),
    getAdminFirestore: () => ({
      collection: (name: string) => ({
        where: () => problemCollection(),
        doc: (id: string) => ({
          get: async () => ({
            exists: true,
            data: () => ({ topics: { Arrays: 2, Strings: 1 } }),
          }),
        }),
        count: () => ({ get: async () => countDocs(4) }),
      }),
    }),
  };
});

import { GET } from '@/app/api/problems/stats/route';

describe('published problem stats API', () => {
  it('returns real published counts without exposing private metadata', async () => {
    const request = new NextRequest('http://localhost/api/problems/stats', {
      headers: { Authorization: 'Bearer test' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.difficulty.Easy).toBe(2);
    expect(body.topics).toEqual({ Arrays: 2, Strings: 1 });
    expect(body.topicsAvailable).toBe(true);
  });
});
