import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  enforceSharedRateLimit: vi.fn(async () => null),
}));

vi.mock('@/firebase/admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'alice' }) }),
  getAdminFirestore: () => ({
    collection: () => ({
      doc: () => ({
        get: async () => ({
          exists: true,
          data: () => ({ xp: 0, dailyLoginStreak: 0, banned: false }),
        }),
        collection: () => ({
          get: async () => ({ docs: [] }),
        }),
      }),
    }),
    runTransaction: vi.fn(),
  }),
}));

import { POST } from '@/app/api/achievements/evaluate/route';

describe('achievement evaluation API', () => {
  it('ignores client-submitted progress and awards nothing without server-verified progress', async () => {
    const request = new NextRequest('http://localhost/api/achievements/evaluate', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ totalSolved: 100, currentStreak: 100 }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.achievements).toEqual([]);
  });
});
