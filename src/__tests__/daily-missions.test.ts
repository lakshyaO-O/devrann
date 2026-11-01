import { describe, expect, it } from 'vitest';
import { countVerifiedMissionProgress, hasAcceptedSubmissionForProblemOnDay } from '@/lib/daily-missions';

describe('countVerifiedMissionProgress', () => {
  it('counts unique problems with accepted judge verdicts', () => {
    expect(countVerifiedMissionProgress([
      { problemId: 'two-sum', verdict: 'Accepted' },
      { problemId: 'two-sum', verdict: 'Accepted' },
      { problemId: 'three-sum', verdict: 'Wrong Answer' },
      { problemId: 'four-sum', verdict: 'Accepted' },
    ], [])).toEqual({ practice: 2, arena: 0 });
  });

  describe('hasAcceptedSubmissionForProblemOnDay', () => {
    const start = new Date('2026-11-01T00:00:00.000Z');
    const end = new Date('2026-11-02T00:00:00.000Z');

    it('requires an accepted submission for the challenge problem during the UTC day', () => {
      expect(hasAcceptedSubmissionForProblemOnDay([
        { problemId: 'target', verdict: 'Accepted', submittedAt: new Date('2026-10-31T23:59:59.999Z') },
        { problemId: 'target', verdict: 'Wrong Answer', submittedAt: new Date('2026-11-01T10:00:00.000Z') },
        { problemId: 'other', verdict: 'Accepted', submittedAt: new Date('2026-11-01T11:00:00.000Z') },
        { problemId: 'target', verdict: 'Accepted', submittedAt: start },
      ], 'target', start, end)).toBe(true);
    });

    it('does not count submissions at or after the next UTC day', () => {
      expect(hasAcceptedSubmissionForProblemOnDay([
        { problemId: 'target', verdict: 'Accepted', submittedAt: end },
      ], 'target', start, end)).toBe(false);
    });
  });

  it('counts only matches with a finalized result', () => {
    expect(countVerifiedMissionProgress([], [
      { result: 'WIN' },
      { result: 'LOSS' },
      { result: 'DRAW' },
      { result: 'PENDING' },
      {},
    ])).toEqual({ practice: 0, arena: 3 });
  });
});
