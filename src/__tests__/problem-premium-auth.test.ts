import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fixture = vi.hoisted(() => ({
  userExists: true,
  tier: 'free' as string | undefined,
  isPremium: true,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceSharedRateLimit: vi.fn(async () => null),
}));

vi.mock('@/firebase/admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'alice' }) }),
  getAdminFirestore: () => ({
    collection: (name: string) => ({
      doc: (id: string) => ({
        id,
        get: async () => {
          if (name === 'problems') {
            return {
              id,
              exists: true,
              data: () => ({
                title: 'Visible',
                isPublished: true,
                isPremium: fixture.isPremium,
              }),
            };
          }
          if (name === 'users') {
            return {
              exists: fixture.userExists,
              data: () => ({ banned: false, subscriptionTier: fixture.tier }),
            };
          }
          return {
            exists: true,
            data: () => ({
              description: 'Public description',
              examples: [{ input: 'n=1', output: '1' }],
              testCases: [
                { input: 'public-input', expected: 'public-output', isHidden: false },
                { input: 'hidden-input', expected: 'hidden-output', isHidden: true },
              ],
              solutionCode: { javascript: 'return 1;' },
              privateEditorialMetadata: 'must not be projected',
            }),
          };
        },
      }),
    }),
  }),
}));

import { GET } from '@/app/api/problems/[id]/route';

function request() {
  return new NextRequest('http://localhost/api/problems/problem-1', {
    headers: { Authorization: 'Bearer test-token' },
  });
}

describe('premium problem access', () => {
  beforeEach(() => {
    fixture.userExists = true;
    fixture.tier = 'free';
    fixture.isPremium = true;
  });

  it('denies premium content to free users without returning the solution', async () => {
    const response = await GET(request(), { params: Promise.resolve({ id: 'problem-1' }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.problem).toBeUndefined();
  });

  it.each(['pro', 'elite'])('allows premium content for %s users', async (tier) => {
    fixture.tier = tier;

    const response = await GET(request(), { params: Promise.resolve({ id: 'problem-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.problem.solutionCode).toEqual({ javascript: 'return 1;' });
  });

  it('denies premium content when the user profile is missing', async () => {
    fixture.userExists = false;

    const response = await GET(request(), { params: Promise.resolve({ id: 'problem-1' }) });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.problem).toBeUndefined();
  });
});
