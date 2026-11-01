export interface MissionSubmissionRecord {
  problemId?: unknown;
  verdict?: unknown;
}

export interface MissionMatchRecord {
  result?: unknown;
}

export interface ChallengeSubmissionRecord {
  problemId?: unknown;
  verdict?: unknown;
  submittedAt?: Date;
}

export function hasAcceptedSubmissionForProblemOnDay(
  submissions: readonly ChallengeSubmissionRecord[],
  problemId: string,
  start: Date,
  end: Date,
) {
  return submissions.some((submission) =>
    submission.problemId === problemId
    && submission.verdict === 'Accepted'
    && submission.submittedAt instanceof Date
    && submission.submittedAt >= start
    && submission.submittedAt < end,
  );
}

export function countVerifiedMissionProgress(
  submissions: readonly MissionSubmissionRecord[],
  matches: readonly MissionMatchRecord[],
) {
  const solvedProblems = new Set(
    submissions.flatMap((submission) =>
      submission.verdict === 'Accepted' && typeof submission.problemId === 'string'
        ? [submission.problemId]
        : [],
    ),
  );
  const completedMatches = matches.filter((match) =>
    match.result === 'WIN' || match.result === 'LOSS' || match.result === 'DRAW',
  ).length;

  return { practice: solvedProblems.size, arena: completedMatches };
}
