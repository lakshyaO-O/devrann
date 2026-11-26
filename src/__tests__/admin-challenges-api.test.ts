import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const state = vi.hoisted(() => ({
  problemPublished: true,
  challengeSet: vi.fn(),
}));

vi.mock('@/firebase/admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'admin-user' }) }),
  getAdminFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (name === 'users') return { exists: true, data: () => ({ role: 'admin' }) };
          if (name === 'problems') {
            return { exists: state.problemPublished, data: () => ({ isPublished: state.problemPublished }) };
          }
          return { exists: false, data: () => undefined };
        },
        set: state.challengeSet,
      }),
    }),
  }),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true }),
  rateLimitResponse: () => NextResponse.json({ error: 'Rate limited' }, { status: 429 }),
}));

import { POST } from '@/app/api/admin/challenges/route';

function request(data: unknown) {
  return new NextRequest('http://localhost/api/admin/challenges', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

describe('admin challenge configuration', () => {
  beforeEach(() => {
    state.problemPublished = true;
    state.challengeSet.mockReset();
  });

  it('only schedules published daily problems and pins their UTC interval', async () => {
    const response = await POST(request({
      action: 'setDaily',
      data: { date: '2026-11-16', problemId: 'published-problem', xpBonus: 50 },
    }));

    expect(response.status).toBe(200);
    expect(state.challengeSet).toHaveBeenCalledWith({
      challenges: [{
        date: '2026-11-16',
        problemId: 'published-problem',
        xpBonus: 50,
        startAt: '2026-11-16T00:00:00.000Z',
        endAt: '2026-11-17T00:00:00.000Z',
        timeZone: 'UTC',
      }],
    }, { merge: true });
  });

  it('rejects unpublished problems and invalid ISO weeks without writing', async () => {
    state.problemPublished = false;
    const unpublished = await POST(request({
      action: 'setDaily',
      data: { date: '2026-11-16', problemId: 'draft', xpBonus: 50 },
    }));
    expect(unpublished.status).toBe(400);

    state.problemPublished = true;
    const invalidWeek = await POST(request({
      action: 'setWeekly',
      data: { week: '2026-W54', problemIds: ['published-problem'], xpBonus: 200 },
    }));
    expect(invalidWeek.status).toBe(400);
    expect(state.challengeSet).not.toHaveBeenCalled();
  });
});
