import { describe, expect, it } from 'vitest';
import {
  getDailyWindow,
  getIsoWeekKey,
  getIsoWeekRange,
  getUtcDayKey,
  getUtcDayRange,
  isDailyChallenge,
  isWeeklyActive,
  isWeeklyChallenge,
  selectDailyChallenge,
} from '@/lib/challenges';

describe('challenge scheduling and timezone helpers', () => {
  it('selects the challenge whose UTC window contains now', () => {
    const challenges = [
      { date: '2026-11-15', problemId: 'yesterday', xpBonus: 10, startAt: '2026-11-15T00:00:00.000Z', endAt: '2026-11-16T00:00:00.000Z' },
      { date: '2026-11-16', problemId: 'today', xpBonus: 20, startAt: '2026-11-16T00:00:00.000Z', endAt: '2026-11-17T00:00:00.000Z' },
    ];
    const now = new Date('2026-11-16T12:00:00.000Z');
    expect(selectDailyChallenge(challenges, now)?.problemId).toBe('today');
  });

  it('falls back to the UTC day key when no explicit window is present', () => {
    const challenges = [
      { date: '2026-11-16', problemId: 'today', xpBonus: 20 },
    ];
    const now = new Date('2026-11-16T23:59:59.000Z');
    expect(selectDailyChallenge(challenges, now)?.problemId).toBe('today');
  });

  it('rejects invalid weekly keys and validates the window', () => {
    expect(getIsoWeekRange('2026-W54')).toBeNull();
    const range = getIsoWeekRange('2026-W47');
    expect(range).not.toBeNull();
    expect(range?.startAt.endsWith('T00:00:00.000Z')).toBe(true);
  });

  it('reports weekly activity only inside the ISO week', () => {
    const weekly = {
      week: getIsoWeekKey(new Date('2026-11-16T12:00:00.000Z')),
      problemIds: ['a'],
      xpBonus: 50,
      startAt: '2026-11-16T00:00:00.000Z',
      endAt: '2026-11-23T00:00:00.000Z',
    };
    expect(isWeeklyChallenge(weekly)).toBe(true);
    expect(isWeeklyActive(weekly, new Date('2026-11-16T12:00:00.000Z'))).toBe(true);
    expect(isWeeklyActive(weekly, new Date('2026-11-30T12:00:00.000Z'))).toBe(false);
  });

  it('builds the UTC day key and range consistently', () => {
    const now = new Date('2026-11-16T23:59:59.000Z');
    expect(getUtcDayKey(now)).toBe('2026-11-16');
    const range = getUtcDayRange('2026-11-16');
    expect(range?.start.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(range?.end.toISOString()).toBe('2026-11-17T00:00:00.000Z');
  });

  it('rejects malformed daily challenge values', () => {
    expect(isDailyChallenge({ date: '2026-11-16', problemId: 'p', xpBonus: -1 })).toBe(false);
    expect(isDailyChallenge({ date: 'not-a-date', problemId: 'p', xpBonus: 10 })).toBe(false);
    expect(isDailyChallenge({ date: '2026-11-16', problemId: '', xpBonus: 10 })).toBe(false);
  });

  it('returns a window from an explicit daily challenge', () => {
    const challenge = {
      date: '2026-11-16',
      problemId: 'p',
      xpBonus: 10,
      startAt: '2026-11-16T00:00:00.000Z',
      endAt: '2026-11-17T00:00:00.000Z',
    };
    const window = getDailyWindow(challenge);
    expect(window?.start.toISOString()).toBe('2026-11-16T00:00:00.000Z');
  });
});
