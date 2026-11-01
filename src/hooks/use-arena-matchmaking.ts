'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/firebase/auth/use-user';
import { initializeFirebase } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import type { DocumentSnapshot, DocumentData } from 'firebase/firestore';
import { useArenaSettings } from '@/hooks/use-arena-settings';
import {
  joinMatchmakingQueue, leaveMatchmakingQueue, subscribeMatchmaking,
  findMatch, fetchBattle,
} from '@/services/arena';
import type { MatchmakingEntry, BattleDocument, Problem, Tier } from '@/types';

type MatchmakingStatus =
  | 'idle'
  | 'joining'
  | 'searching'
  | 'found'
  | 'creating_battle'
  | 'ready'
  | 'error';

export function useArenaMatchmaking() {
  const { user } = useUser();
  const { settings } = useArenaSettings();
  const [profile, setProfile] = useState<{ username: string; rating: number; tier: string } | null>(null);
  const [status, setStatus] = useState<MatchmakingStatus>('idle');
  const [opponent, setOpponent] = useState<{ uid: string; username: string; rating: number; tier: string } | null>(null);
  const [battle, setBattle] = useState<BattleDocument | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queueTime, setQueueTime] = useState(0);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const matchedEntryRef = useRef<MatchmakingEntry | null>(null);
  const searchingRef = useRef(false);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    if (!user?.uid) { setProfile(null); return; }
    let mounted = true;
    const { firestore: db } = initializeFirebase();
    if (!db) {
      setProfile(null);
      setError('Arena matchmaking is unavailable because the database is not configured.');
      return;
    }
    getDoc(doc(db, 'users', user.uid)).then((snap: DocumentSnapshot<DocumentData>) => {
      if (!mounted) return;
      if (!snap.exists() || typeof snap.data().rating !== 'number') {
        setProfile(null);
        setError('Your account profile has no verified rating yet, so it cannot enter matchmaking.');
        return;
      }
      const data = snap.data();
      setProfile({
        username: data.username || user.displayName || 'Player',
        rating: data.rating,
        tier: data.tier || 'Beginner',
      });
      setError(null);
    }).catch((cause: unknown) => {
      if (!mounted) return;
      setProfile(null);
      setError(cause instanceof Error ? cause.message : 'Could not load your matchmaking profile.');
    });
    return () => { mounted = false; };
  }, [user?.uid, user?.displayName]);

  const stopQueueTimers = useCallback(() => {
    searchingRef.current = false;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const cleanup = useCallback(() => {
    stopQueueTimers();
    if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
  }, [stopQueueTimers]);

  useEffect(() => cleanup, [cleanup]);

  const joinQueue = useCallback(async () => {
    if (!user?.uid) {
      setError('Sign in before joining matchmaking.');
      setStatus('error');
      return;
    }
    if (!profile) {
      setError('Your matchmaking profile is still loading or is missing a verified rating.');
      setStatus('error');
      return;
    }
    cleanup();
    setStatus('joining');
    setError(null);
    setBattle(null);
    setOpponent(null);
    setQueueTime(0);
    matchedEntryRef.current = null;

    try {
      await joinMatchmakingQueue(user.uid, {
        userId: user.uid,
        username: profile.username,
        rating: profile.rating,
        tier: profile.tier as Tier,
        preferredLanguage: settings.preferredLanguage,
        rated: settings.rated,
        difficulty: settings.difficulty,
        category: settings.category,
        timeControl: settings.timeControl,
        region: settings.region,
        eloRange: settings.eloRange,
      });
      searchingRef.current = true;
      setStatus('searching');

      timerRef.current = setInterval(() => {
        setQueueTime(prev => prev + 1);
      }, 1000);

      unsubscribeRef.current = subscribeMatchmaking(user.uid, (entry) => {
        if (entry?.status === 'matched') {
          matchedEntryRef.current = entry;
          setError(null);
          cleanup();
          setStatus('found');
        }
      });

      pollRef.current = setInterval(async () => {
        if (!user.uid || !searchingRef.current || pollInFlightRef.current) return;
        pollInFlightRef.current = true;
        try {
          const found = await findMatch(user.uid, settings);
          if (found && searchingRef.current) {
            setError(null);
            setOpponent({ uid: found.userId, username: found.username, rating: found.rating, tier: found.tier });
            setStatus('found');
            stopQueueTimers();
          }
        } catch (cause) {
          if (searchingRef.current) {
            setError(cause instanceof Error ? cause.message : 'Matchmaking search failed.');
            setStatus('error');
            cleanup();
            await leaveMatchmakingQueue(user.uid).catch(() => undefined);
          }
        } finally {
          pollInFlightRef.current = false;
        }
      }, 3000);
    } catch (e: any) {
      setError(e?.message || 'Failed to join queue');
      setStatus('error');
      cleanup();
    }
  }, [user, profile, settings, cleanup, stopQueueTimers]);

  const leaveQueue = useCallback(async () => {
    cleanup();
    matchedEntryRef.current = null;
    if (!user?.uid) {
      setStatus('idle');
      setOpponent(null);
      setQueueTime(0);
      return;
    }
    try {
      await leaveMatchmakingQueue(user.uid);
      setError(null);
      setStatus('idle');
      setOpponent(null);
      setQueueTime(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not leave the matchmaking queue.');
      setStatus('error');
    }
  }, [user?.uid, cleanup]);

  const acceptMatch = useCallback(async () => {
    if (!user?.uid || !profile) return;

    // Passive side: the creator already made the battle; join it directly.
    const matchedEntry = matchedEntryRef.current;
    if (matchedEntry?.battleId) {
      setStatus('creating_battle');
      try {
        const b = await fetchBattle(matchedEntry.battleId);
        if (!b) throw new Error('Battle could not be loaded');
        setBattle(b);
        setProblem({
          id: b.problem.id,
          title: b.problem.title,
          difficulty: b.problem.difficulty as any,
          category: b.problem.category || '',
          points: b.problem.points || 100,
          description: b.problem.description,
          constraints: b.problem.constraints || [],
          examples: b.problem.examples || [],
          starterCode: b.problem.starterCode || {},
        });
        if (!opponent) {
          setOpponent(
            b.player1?.userId === user.uid
              ? { uid: b.player2?.userId || '', username: b.player2?.username || 'Player', rating: b.player2?.rating || 800, tier: b.player2?.tier || 'Beginner' }
              : { uid: b.player1?.userId || '', username: b.player1?.username || 'Player', rating: b.player1?.rating || 800, tier: b.player1?.tier || 'Beginner' },
          );
        }
        setStatus('ready');
        cleanup();
      } catch (e: any) {
        setError(e?.message || 'Failed to join battle');
        setStatus('error');
      }
      return;
    }

    if (!opponent) return;
    setStatus('creating_battle');
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/battles/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          opponentId: opponent.uid || '',
          rated: settings.rated,
          timeControl: settings.timeControl,
          language: settings.preferredLanguage,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create battle');

      if (data.battleId) {
        const battleDoc = await fetchBattle(data.battleId);
        if (battleDoc) {
          setBattle(battleDoc);
        }
        setProblem({
          id: data.problem.id,
          title: data.problem.title,
          difficulty: data.problem.difficulty as any,
          category: '',
          points: 100,
          description: data.problem.description,
          constraints: [],
          examples: data.problem.examples || [],
          starterCode: data.problem.starterCode,
        });
        cleanup();
        setStatus('ready');
      }
    } catch (e: any) {
      setError(e.message);
      setStatus('error');
    }
  }, [user, opponent, profile, settings, cleanup]);

  return {
    status, opponent, battle, problem, error, queueTime,
    profileReady: profile !== null,
    rated: settings.rated,
    joinQueue, leaveQueue, acceptMatch,
  };
}
