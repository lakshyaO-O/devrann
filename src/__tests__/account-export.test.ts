import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { toExportValue } from '@/lib/account-export';

describe('toExportValue', () => {
  it('serializes dates and removes secret-like keys recursively', () => {
    expect(toExportValue({
      createdAt: Timestamp.fromDate(new Date('2026-01-02T03:04:05.000Z')),
      profile: {
        bio: 'Problem solver',
        accessToken: 'do-not-export',
      },
      passwordHash: 'do-not-export',
      items: [{ id: 'one', apiKey: 'do-not-export' }],
    })).toEqual({
      createdAt: '2026-01-02T03:04:05.000Z',
      profile: { bio: 'Problem solver' },
      items: [{ id: 'one' }],
    });
  });

  it('preserves ordinary values and renders document references as paths', () => {
    expect(toExportValue({
      count: 3,
      enabled: true,
      owner: { path: 'users/alice' },
    })).toEqual({
      count: 3,
      enabled: true,
      owner: { documentPath: 'users/alice' },
    });
  });
});
