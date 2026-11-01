'use client';

import { useState, useEffect, useCallback } from 'react';
import { initializeFirebase } from '@/firebase';
import {
  collection, query, orderBy, onSnapshot, where,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData, QuerySnapshot } from 'firebase/firestore';
import type { PracticeProblemDocument, UserPracticeProgress, Difficulty } from '@/types';
import {
  fetchProblems, getAllUserProgress, toggleBookmark as fbToggleBookmark,
  fetchRecentlyViewed, trackRecentlyViewed,
} from '@/services/practice';

export function usePracticeProblems() {
  const [problems, setProblems] = useState<PracticeProblemDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const { firestore: db } = initializeFirebase();
    if (!db) {
      setProblems([]);
      setError(new Error('The problem database is not configured.'));
      setLoading(false);
      return () => { active = false; };
    }
    const q = query(
      collection(db, 'problems'),
      where('isPublished', '==', true),
      orderBy('title', 'asc'),
    );
    const unsub = onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
      const fbData = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as PracticeProblemDocument));
      if (!active) return;
      setProblems(fbData);
      setError(null);
      setLoading(false);
    }, (cause) => {
      if (!active) return;
      setProblems([]);
      setError(cause);
      setLoading(false);
    });
    return () => {
      active = false;
      unsub();
    };
  }, [retryToken]);

  return { problems, loading, error, retry: () => setRetryToken((token) => token + 1) };
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
