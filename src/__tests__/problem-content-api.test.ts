import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

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
            return { id, exists: true, data: () => ({ title: 'Visible', isPublished: true }) };
          }
          if (name === 'users') return { exists: true, data: () => ({ banned: false }) };
          return {
            exists: true,
            data: () => ({
              description: 'Public description',
              examples: [{ input: 'n=1', output: '1' }],
              testCases: [
                { input: 'public-input', expected: 'public-output', isHidden: false },
                { input: 'hidden-input', expected: 'hidden-output', isHidden: true },
                { input: 'unclassified-input', expected: 'unclassified-output' },
              ],
              privateEditorialMetadata: 'must not be projected',
            }),
          };
        },
      }),
    }),
  }),
}));

import { GET } from '@/app/api/problems/[id]/route';

describe('published problem content API', () => {
  it('projects only explicitly public test cases and allowlisted metadata', async () => {
    const request = new NextRequest('http://localhost/api/problems/problem-1', {
      headers: { Authorization: 'Bearer test' },
    });
    const response = await GET(request, { params: Promise.resolve({ id: 'problem-1' }) });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.problem.testCases).toEqual([
      { input: 'public-input', expected: 'public-output', isHidden: false },
    ]);
    expect(body.problem.privateEditorialMetadata).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('hidden-input');
    expect(JSON.stringify(body)).not.toContain('unclassified-input');
  });
});
