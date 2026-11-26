'use client';

import { useState, useEffect, useCallback } from 'react';
import { initializeFirebase } from '@/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, query, onSnapshot,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData, QuerySnapshot } from 'firebase/firestore';
import type { PracticeProblemSummary, UserPracticeProgress, Difficulty } from '@/types';
import {
  fetchProblems, fetchProblemPage, fetchProblemStats, getAllUserProgress, toggleBookmark as fbToggleBookmark,
  fetchRecentlyViewed, trackRecentlyViewed,
} from '@/services/practice';
import type { ProblemCatalogPage, ProblemCatalogQuery, ProblemCatalogStats } from '@/services/practice';

export function useProblemCatalogPage(
  options: ProblemCatalogQuery,
) {
  const [page, setPage] = useState<ProblemCatalogPage>({
    problems: [], nextCursor: null, hasMore: false, pageSize: 25,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const search = options.search ?? '';
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const difficulty = options.difficulty ?? '';
  const topic = options.topic ?? '';
  const sort = options.sort ?? 'title';
  const status = options.status ?? 'all';
  const cursor = options.cursor ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const { auth } = initializeFirebase();
    if (!auth) {
      setPage({ problems: [], nextCursor: null, hasMore: false, pageSize: 25 });
      setError(new Error('Authentication is unavailable.'));
      setLoading(false);
      return () => { active = false; };
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setPage({ problems: [], nextCursor: null, hasMore: false, pageSize: 25 });
        setError(new Error('Sign in to load published problems.'));
        setLoading(false);
        return;
      }
      setLoading(true);
      fetchProblemPage({ search: debouncedSearch, difficulty, topic, sort, status, cursor }).then((result) => {
        if (active) setPage(result);
      }).catch((cause) => {
        if (!active) return;
        setPage({ problems: [], nextCursor: null, hasMore: false, pageSize: 25 });
        setError(cause instanceof Error ? cause : new Error('Problem catalog is unavailable.'));
      }).finally(() => {
        if (active) setLoading(false);
      });
    });
    return () => { active = false; unsubscribe(); };
  }, [debouncedSearch, difficulty, topic, sort, status, cursor, retryToken]);

  return {
    ...page,
    loading,
    error,
    retry: () => setRetryToken((token) => token + 1),
  };
}

export function usePracticeProblems() {
  const [problems, setProblems] = useState<PracticeProblemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const { auth } = initializeFirebase();
    if (!auth) {
      setProblems([]);
      setError(new Error('Authentication is unavailable.'));
      setLoading(false);
      return () => { active = false; };
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setProblems([]);
        setError(new Error('Sign in to load published problems.'));
        setLoading(false);
        return;
      }

      setLoading(true);
      fetchProblems().then((items) => {
        if (!active) return;
        setProblems(items);
        setError(null);
      }).catch((cause) => {
        if (!active) return;
        setProblems([]);
        setError(cause instanceof Error ? cause : new Error('Problem catalog is unavailable.'));
      }).finally(() => {
        if (active) setLoading(false);
      });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [retryToken]);

  return { problems, loading, error, retry: () => setRetryToken((token) => token + 1) };
}

export function useProblemStats() {
  const [stats, setStats] = useState<ProblemCatalogStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    const { auth } = initializeFirebase();
    if (!auth) {
      setError(new Error('Authentication is unavailable.'));
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    setError(null);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setStats(null);
        setError(new Error('Sign in to load problem statistics.'));
        setLoading(false);
        return;
      }
      fetchProblemStats().then((result) => {
        if (active) setStats(result);
      }).catch((cause) => {
        if (!active) return;
        setStats(null);
        setError(cause instanceof Error ? cause : new Error('Problem statistics are unavailable.'));
      }).finally(() => {
        if (active) setLoading(false);
      });
    });

    return () => { active = false; unsubscribe(); };
  }, [retryToken]);

  return {
    stats,
    loading,
    error,
    retry: () => setRetryToken((token) => token + 1),
  };
}

export function useUserProgress(userId: string | null) {
  const [progress, setProgress] = useState<Record<string, UserPracticeProgress>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    const { firestore: db } = initializeFirebase();
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'users', userId, 'practiceProgress'));
    const unsub = onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
      const map: Record<string, UserPracticeProgress> = {};
      snap.docs.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
        const data = d.data();
        if (data.lastSubmittedAt?.toDate) {
          data.lastSubmittedAt = data.lastSubmittedAt.toDate().toISOString();
        }
        map[d.id] = { problemId: d.id, ...data } as UserPracticeProgress;
      });
      setProgress(map);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [userId]);

  return { progress, loading };
}

export function useToggleBookmark(userId: string | null) {
  return useCallback(async (problemId: string, current: boolean) => {
    if (!userId) return;
    await fbToggleBookmark(userId, problemId, current);
  }, [userId]);
}

export function useRecentlyViewed(userId: string | null) {
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    fetchRecentlyViewed(userId).then(setRecent).catch((err) => console.error('[Practice] Failed to fetch recently viewed', err)).finally(() => setLoading(false));
  }, [userId]);

  const track = useCallback(async (problem: { id: string; title: string; difficulty: Difficulty }) => {
    if (!userId) return;
    await trackRecentlyViewed(userId, problem);
  }, [userId]);

  return { recent, loading, track };
}
