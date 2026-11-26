'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  claimDailyChallengeXp,
  claimWeeklyChallengeXp,
  fetchChallengeStatus,
  type ChallengeProblemSummary,
} from '@/services/practice';
import { useAppStore } from '@/store/app-store';

export function useDailyChallenge(userId: string | null) {
  const [daily, setDaily] = useState<{ date: string; problemId: string; xpBonus: number } | null>(null);
  const [status, setStatus] = useState<{ completed: boolean; claimed: boolean; date: string } | null>(null);
  const [problem, setProblem] = useState<ChallengeProblemSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const { loadBeginnerFromFirebase } = useAppStore();

  useEffect(() => {
    let active = true;
    if (!userId) {
      setDaily(null);
      setStatus(null);
      setProblem(null);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    fetchChallengeStatus()
      .then((result) => {
        if (!active) return;
        if (result.daily) {
          setDaily({
            date: result.daily.date,
            problemId: result.daily.problemId,
            xpBonus: result.daily.xpBonus,
          });
          setStatus({
            completed: result.daily.completed,
            claimed: result.daily.claimed,
            date: result.daily.date,
          });
          setProblem(result.daily.problem);
        } else {
          setDaily(null);
          setStatus(null);
          setProblem(null);
        }
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause : new Error('Challenges are temporarily unavailable.'));
        setDaily(null);
        setStatus(null);
        setProblem(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [userId, retryToken]);

  const claim = useCallback(async () => {
    if (!userId || !daily || status?.claimed) return;
    const xpAwarded = await claimDailyChallengeXp(userId);
    if (xpAwarded > 0) {
      await loadBeginnerFromFirebase(userId);
      setStatus((previous) => previous ? { ...previous, completed: true, claimed: true } : previous);
    }
  }, [userId, daily, status, loadBeginnerFromFirebase]);

  return {
    daily,
    status,
    problem,
    loading,
    error,
    claim,
    retry: () => setRetryToken((token) => token + 1),
  };
}

export function useWeeklyChallenge(userId: string | null) {
  const [weekly, setWeekly] = useState<{ week: string; problemIds: string[]; xpBonus: number; startAt?: string; endAt?: string } | null>(null);
  const [progress, setProgress] = useState<{ solved: number; total: number; claimed: boolean; solvedProblemIds: string[] }>({ solved: 0, total: 0, claimed: false, solvedProblemIds: [] });
  const [problems, setProblems] = useState<ChallengeProblemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const { loadBeginnerFromFirebase } = useAppStore();

  useEffect(() => {
    let active = true;
    if (!userId) {
      setWeekly(null);
      setProgress({ solved: 0, total: 0, claimed: false, solvedProblemIds: [] });
      setProblems([]);
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    fetchChallengeStatus()
      .then((result) => {
        if (!active) return;
        if (result.weekly) {
          setWeekly({
            week: result.weekly.week,
            problemIds: result.weekly.problemIds,
            xpBonus: result.weekly.xpBonus,
            startAt: result.weekly.startAt,
            endAt: result.weekly.endAt,
          });
          setProgress({
            solved: result.weekly.solvedProblemIds.length,
            total: result.weekly.problemIds.length,
            claimed: result.weekly.claimed,
            solvedProblemIds: result.weekly.solvedProblemIds,
          });
          setProblems(result.weekly.problems);
        } else {
          setWeekly(null);
          setProgress({ solved: 0, total: 0, claimed: false, solvedProblemIds: [] });
          setProblems([]);
        }
      })
      .catch((cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause : new Error('Challenges are temporarily unavailable.'));
        setWeekly(null);
        setProgress({ solved: 0, total: 0, claimed: false, solvedProblemIds: [] });
        setProblems([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [userId, retryToken]);

  const refresh = useCallback(async () => {
    setRetryToken((token) => token + 1);
  }, []);

  const claim = useCallback(async () => {
    if (!userId || !weekly || progress.claimed) return null;
    const result = await claimWeeklyChallengeXp(userId);
    if (result.xpAwarded > 0) {
      await loadBeginnerFromFirebase(userId);
    }
    setProgress((previous) => ({
      solved: result.solved,
      total: result.total,
      claimed: previous.claimed || result.alreadyClaimed || result.xpAwarded > 0,
      solvedProblemIds: result.xpAwarded > 0 || result.alreadyClaimed
        ? weekly.problemIds
        : previous.solvedProblemIds,
    }));
    return result;
  }, [userId, weekly, progress.claimed, loadBeginnerFromFirebase]);

  return { weekly, progress, problems, loading, error, claim, refresh, retry: refresh };
}
