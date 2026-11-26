import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/rate-limit', () => ({
  enforceSharedRateLimit: vi.fn(async () => null),
}));

vi.mock('@/firebase/admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'alice' }) }),
  getAdminFirestore: () => ({
    collection: (name: string) => {
      if (name === 'users') {
        const userRef = {
          get: async () => ({ data: () => ({ banned: false }) }),
          collection: () => ({
            doc: (id: string) => ({
              get: async () => ({
                data: () => (id === 'public-problem' ? { solved: true, attempted: true } : undefined),
              }),
            }),
          }),
        };
        return { doc: () => userRef };
      }
      const makeProblem = (id: string, title: string) => ({
        id,
        exists: true,
        data: () => ({
          title,
          difficulty: 'Easy',
          category: 'Arrays',
          points: 10,
          topics: ['Arrays'],
          isPublished: true,
          titleLower: title.toLowerCase(),
          testCases: [{ input: 'secret input', expected: 'secret output', isHidden: true }],
          hiddenTestCases: [{ input: 'another secret' }],
          adminNotes: 'private metadata',
        }),
      });
      const docs = [
        makeProblem('public-problem', 'Public problem'),
        makeProblem('second-problem', 'Second problem'),
      ];
      let requestedLimit = docs.length;
      const query = {
        where: () => query,
        orderBy: () => query,
        startAfter: () => query,
        limit: (value: number) => { requestedLimit = value; return query; },
        get: async () => ({ docs: requestedLimit === 2 ? docs : docs.slice(0, 1) }),
      };
      return {
        where: () => query,
        doc: (id: string) => ({
          get: async () => docs.find((doc) => doc.id === id) ?? { exists: false, id, data: () => undefined },
        }),
      };
    },
  }),
}));

import { GET } from '@/app/api/problems/route';

const authHeaders = { Authorization: ['Bearer', 'test-token'].join(' ') };

describe('published problem list API', () => {
  it('returns only public summary fields, never problem tests or private metadata', async () => {
    const request = new NextRequest('http://localhost/api/problems', { headers: authHeaders });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.problems).toEqual([{
      id: 'public-problem',
      title: 'Public problem',
      difficulty: 'Easy',
      category: 'Arrays',
      points: 10,
      topics: ['Arrays'],
    }]);
    expect(body).toMatchObject({ nextCursor: null, hasMore: false, pageSize: 25 });
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(JSON.stringify(body)).not.toContain('private metadata');
  });

  it('returns a stable cursor when another page exists', async () => {
    const request = new NextRequest(
      'http://localhost/api/problems?limit=1&difficulty=Easy&topic=Arrays',
      { headers: authHeaders },
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.problems.map((problem: { id: string }) => problem.id)).toEqual(['public-problem']);
    expect(body).toMatchObject({ nextCursor: 'public-problem', hasMore: true, pageSize: 1 });
  });

  it('rejects invalid pagination values', async () => {
    const request = new NextRequest('http://localhost/api/problems?limit=51', { headers: authHeaders });
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it('filters solved problems using the authenticated user progress records', async () => {
    const request = new NextRequest('http://localhost/api/problems?status=solved&limit=1', {
      headers: authHeaders,
    });
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.problems.map((problem: { id: string }) => problem.id)).toEqual(['public-problem']);
  });
});
