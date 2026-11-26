import { describe, expect, it } from 'vitest';
import { getProblemSubmissionXp } from '@/lib/problem-rewards';

describe('problem submission rewards', () => {
  it('awards XP only for verified accepted submissions', () => {
    expect(getProblemSubmissionXp(false, false)).toBe(0);
    expect(getProblemSubmissionXp(false, true)).toBe(0);
  });

  it('awards the first-solve and repeat-acceptance amounts', () => {
    expect(getProblemSubmissionXp(true, false)).toBe(50);
    expect(getProblemSubmissionXp(true, true)).toBe(15);
  });
});
