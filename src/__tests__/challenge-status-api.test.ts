import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { getIsoWeekKey } from '@/lib/challenges';

vi.mock('@/lib/rate-limit', () => ({
  enforceSharedRateLimit: vi.fn(async () => null),
}));

const today = new Date().toISOString().slice(0, 10);
const thisWeek = getIsoWeekKey(new Date());
const dailyChallenge = {
  date: today,
  problemId: 'daily-problem',
  xpBonus: 50,
  startAt: `${today}T00:00:00.000Z`,
  endAt: new Date(new Date(`${today}T00:00:00.000Z`).getTime() + 86400000).toISOString(),
};
const weeklyChallenge = {
  week: thisWeek,
  problemIds: ['weekly-a', 'weekly-b'],
  xpBonus: 200,
  startAt: new Date().toISOString(),
  endAt: new Date(Date.now() + 7 * 86400000).toISOString(),
};

function makeDoc(data: any, exists = true) {
  return { exists, data: () => data };
}

vi.mock('@/firebase/admin', () => {
  const challengeCollection = {
    doc: (id: string) => ({
      get: async () => {
        if (id === 'daily') return makeDoc({ challenges: [dailyChallenge] });
        if (id === 'weekly') return makeDoc(weeklyChallenge);
        return makeDoc(null, false);
      },
    }),
  };
  const problemCollection = {
    doc: (id: string) => ({
      get: async () => makeDoc({ title: `Problem ${id}`, difficulty: 'Easy', isPublished: true }),
    }),
  };
  const submissionsQuery: any = {
    where: () => submissionsQuery,
    get: async () => ({
      docs: [
        {
          data: () => ({
            problemId: 'daily-problem',
            verdict: 'Accepted',
            submittedAt: { toDate: () => new Date(`${today}T10:00:00.000Z`) },
          }),
        },
        {
          data: () => ({
            problemId: 'weekly-a',
            verdict: 'Accepted',
            submittedAt: { toDate: () => new Date() },
          }),
        },
      ],
    }),
  };
  const userDoc = {
    collection: (name: string) => {
      if (name === 'submissions') return submissionsQuery;
      return {
        doc: (id: string) => ({
          get: async () => {
            if (name === 'challenges') {
              if (id === 'daily') return makeDoc({ date: today, claimed: false });
              if (id === 'weekly') return makeDoc({ week: thisWeek, claimed: false });
            }
            return makeDoc(null, false);
          },
          collection: () => ({ doc: () => ({ get: async () => makeDoc(null, false) }) }),
        }),
      };
    },
    get: async () => makeDoc({ xp: 0 }),
  };
  const userCollection = { doc: () => userDoc };

  return {
    getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'alice' }) }),
    getAdminFirestore: () => ({
      collection: (name: string) => {
        if (name === 'challenges') return challengeCollection;
        if (name === 'problems') return problemCollection;
        if (name === 'users') return userCollection;
        return { doc: () => ({ get: async () => makeDoc(null, false) }) };
      },
    }),
  };
});

import { GET } from '@/app/api/challenges/status/route';

describe('challenge status API', () => {
  it('reports verified daily completion and weekly progress', async () => {
    const request = new NextRequest('http://localhost/api/challenges/status', {
      headers: { Authorization: 'Bearer test' },
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.daily.completed).toBe(true);
    expect(body.daily.claimed).toBe(false);
    expect(body.weekly.solvedProblemIds).toContain('weekly-a');
    expect(body.weekly.completed).toBe(false);
    expect(body.timeZone).toBe('UTC');
  });
});
