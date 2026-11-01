import { describe, expect, it } from 'vitest';
import { calculateSubmissionStreak } from '@/lib/profile-stats';

describe('calculateSubmissionStreak', () => {
  it('counts consecutive UTC activity days through today', () => {
    expect(calculateSubmissionStreak({
      '2026-10-30': 1,
      '2026-10-31': 2,
      '2026-11-01': 1,
    }, new Date('2026-11-01T10:00:00Z'))).toBe(3);
  });

  it('continues a streak from yesterday when there is no activity today', () => {
    expect(calculateSubmissionStreak({
      '2026-10-30': 1,
      '2026-10-31': 1,
    }, new Date('2026-11-01T10:00:00Z'))).toBe(2);
  });

  it('does not count activity if there is a gap before today', () => {
    expect(calculateSubmissionStreak({
      '2026-10-30': 1,
      '2026-11-01': 1,
    }, new Date('2026-11-01T10:00:00Z'))).toBe(1);
  });
});
