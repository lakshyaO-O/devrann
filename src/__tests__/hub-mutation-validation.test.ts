import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const state = vi.hoisted(() => ({
  role: 'admin' as string,
  docExists: true,
  docData: {} as Record<string, unknown>,
  update: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
  add: vi.fn(async () => ({ id: 'new-id' })),
  auditAdd: vi.fn(async () => undefined),
}));

vi.mock('@/firebase/admin', () => ({
  getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: 'admin-user', email: 'admin@test.com' }) }),
  getAdminFirestore: () => ({
    collection: (name: string) => ({
      doc: (_id: string) => ({
        get: async () => ({ exists: state.docExists, data: () => state.docData }),
        update: state.update,
        delete: state.delete,
      }),
      add: name === 'auditLogs' ? state.auditAdd : state.add,
    }),
  }),
  initializeAdmin: () => true,
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true, retryAfterMs: 0 }),
  rateLimitResponse: (ms: number) => NextResponse.json({ error: 'Rate limited', retryAfterMs: ms }, { status: 429 }),
}));

import { PUT as contactPut } from '@/app/api/hub/contact/route';
import { PUT as hostPut } from '@/app/api/hub/host-applications/route';
import { PUT as bugPut, DELETE as bugDelete } from '@/app/api/hub/bug-reports/route';

function req(url: string, method: string, body?: unknown) {
  return new NextRequest(url, {
    method,
    headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('hub mutation validation', () => {
  beforeEach(() => {
    state.role = 'admin';
    state.docExists = true;
    state.docData = { status: 'open', role: 'admin' };
    state.update.mockClear();
    state.delete.mockClear();
    state.add.mockClear();
    state.auditAdd.mockClear();
  });

  it('rejects invalid contact status', async () => {
    const res = await contactPut(req('http://localhost/api/hub/contact', 'PUT', { id: 'c1', status: 'bad' }));
    expect(res.status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });

  it('rejects invalid host application status', async () => {
    const res = await hostPut(req('http://localhost/api/hub/host-applications', 'PUT', { id: 'h1', status: 'bad' }));
    expect(res.status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });

  it('rejects invalid bug report status and long resolution', async () => {
    const badStatus = await bugPut(req('http://localhost/api/hub/bug-reports', 'PUT', { id: 'b1', status: 'nope' }));
    expect(badStatus.status).toBe(400);
    const badResolution = await bugPut(req('http://localhost/api/hub/bug-reports', 'PUT', { id: 'b1', resolution: 'x'.repeat(2001) }));
    expect(badResolution.status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();
  });

  it('accepts valid bug report update', async () => {
    const res = await bugPut(req('http://localhost/api/hub/bug-reports', 'PUT', { id: 'b1', status: 'in_progress', assignedTo: 'admin-user', resolution: 'looking' }));
    expect(res.status).toBe(200);
    expect(state.update).toHaveBeenCalled();
  });

  it('requires id for bug report delete', async () => {
    const res = await bugDelete(req('http://localhost/api/hub/bug-reports', 'DELETE'));
    expect(res.status).toBe(400);
    expect(state.delete).not.toHaveBeenCalled();
  });
});
