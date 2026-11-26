export function getProblemSubmissionXp(accepted: boolean, alreadySolved: boolean): number {
  if (!accepted) return 0;
  return alreadySolved ? 15 : 50;
}
