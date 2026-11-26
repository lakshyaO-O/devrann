import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  uid: 'charlie',
  participants: ['alice', 'bob'],
  senderId: 'alice',
  update: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceSharedRateLimit: vi.fn(async () => null),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    arrayUnion: (...values: string[]) => ({ arrayUnion: values }),
    serverTimestamp: () => 'server-time',
  },
  Timestamp: { fromMillis: (value: number) => value },
}));

vi.mock('@/firebase/admin', () => {
  const messageRef = { path: 'chats/chat/messages/message' };
  const chatRef = {
    path: 'chats/chat',
    get: async () => ({ exists: true, data: () => ({ participants: mocks.participants }) }),
    collection: () => ({ doc: () => messageRef }),
  };
  const db = {
    collection: () => ({ doc: () => chatRef }),
    runTransaction: async (operation: (tx: {
      get: (ref: unknown) => Promise<{ exists: boolean; data: () => Record<string, unknown> }>;
      update: typeof mocks.update;
      create: typeof mocks.create;
    }) => Promise<unknown>) => operation({
      get: async (ref) => ref === chatRef
        ? { exists: true, data: () => ({ participants: mocks.participants }) }
        : {
            exists: true,
            data: () => ({
              senderId: mocks.senderId,
              deleted: false,
              createdAt: { toMillis: () => Date.now() },
            }),
          },
      update: mocks.update,
      create: mocks.create,
    }),
  };
  return {
    getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: mocks.uid }) }),
    getAdminFirestore: () => db,
  };
});

import { POST } from '@/app/api/chats/[chatId]/route';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/chats/chat', {
    method: 'POST',
    headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('chat API authorization', () => {
  beforeEach(() => {
    mocks.uid = 'charlie';
    mocks.participants = ['alice', 'bob'];
    mocks.senderId = 'alice';
    mocks.update.mockClear();
    mocks.create.mockClear();
  });

  it('rejects a nonmember attempting to send into a private conversation', async () => {
    const response = await POST(request({ action: 'send', text: 'Not a member' }), {
      params: Promise.resolve({ chatId: 'chat' }),
    });

    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does not allow a non-sender to edit a message', async () => {
    mocks.uid = 'bob';
    const response = await POST(request({ action: 'edit', messageId: 'message', text: 'forged' }), {
      params: Promise.resolve({ chatId: 'chat' }),
    });

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('does not allow a non-sender to delete a message', async () => {
    mocks.uid = 'bob';
    const response = await POST(request({ action: 'delete', messageId: 'message' }), {
      params: Promise.resolve({ chatId: 'chat' }),
    });

    expect(response.status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('allows the sender to edit and delete their own message', async () => {
    mocks.uid = 'alice';

    const editResponse = await POST(request({
      action: 'edit',
      messageId: 'message',
      text: 'Updated by sender',
    }), {
      params: Promise.resolve({ chatId: 'chat' }),
    });
    const deleteResponse = await POST(request({
      action: 'delete',
      messageId: 'message',
    }), {
      params: Promise.resolve({ chatId: 'chat' }),
    });

    expect(editResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledTimes(2);
  });

  it('derives read receipts from the verified caller, not a client-supplied user id', async () => {
    mocks.uid = 'bob';
    const response = await POST(request({
      action: 'read',
      messageId: 'message',
      userId: 'alice',
    }), {
      params: Promise.resolve({ chatId: 'chat' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(
      expect.anything(),
      { readBy: { arrayUnion: ['bob'] } },
    );
  });
});
