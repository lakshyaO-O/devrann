'use client';

import { useState, useCallback, useEffect } from 'react';
import { initializeFirebase } from '@/firebase';
import {
  collection, doc, deleteDoc, query, onSnapshot, orderBy,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { FriendDoc, BlockDoc } from '@/app/lib/types';

async function postFriendAction(action: string, data: Record<string, string>) {
  const { auth } = initializeFirebase();
  const user = auth?.currentUser;
  if (!user) throw new Error('You must be signed in.');
  const token = await user.getIdToken();
  const response = await fetch('/api/friends', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Friend operation failed.');
}

export function useFriends(userId: string | null) {
  const [friends, setFriends] = useState<FriendDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) { setFriends([]); setLoading(false); return; }
    setLoading(true);
    let unsub: (() => void) | null = null;
    const { firestore: db } = initializeFirebase();
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'users', userId, 'friends'), orderBy('addedAt', 'desc'));
    unsub = onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
      setFriends(snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as unknown as FriendDoc)));
      setLoading(false);
    }, () => { setError('Failed to load friends'); setLoading(false); });
    return () => { if (unsub) unsub(); };
  }, [userId]);

  return { friends, loading, error };
}

export function useBlockedUsers(userId: string | null) {
  const [blocked, setBlocked] = useState<BlockDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setBlocked([]); setLoading(false); return; }
    setLoading(true);
    let unsub: (() => void) | null = null;
    const { firestore: db } = initializeFirebase();
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'users', userId, 'blocked'), orderBy('blockedAt', 'desc'));
    unsub = onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
      setBlocked(snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as unknown as BlockDoc)));
      setLoading(false);
    }, () => { setLoading(false); });
    return () => { if (unsub) unsub(); };
  }, [userId]);

  return { blocked, loading };
}

export function useSendFriendRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendRequest = useCallback(async (params: {
    fromUserId: string; fromUsername: string; fromPhotoURL: string;
    toUserId: string; toUsername: string;
  }) => {
    setLoading(true); setError(null);
    try {
      await postFriendAction('send', { toUserId: params.toUserId });
      return true;
    } catch (err: any) { setError(err.message || 'Failed'); return false; }
    finally { setLoading(false); }
  }, []);

  return { sendRequest, loading, error };
}

export function useAcceptFriendRequest() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const acceptRequest = useCallback(async (params: { requestId: string; toUserId: string; fromUser: any }) => {
    setLoading(true); setError(null);
    try {
      await postFriendAction('accept', { requestId: params.requestId });
      return true;
    } catch (err: any) { setError(err.message || 'Failed'); return false; }
    finally { setLoading(false); }
  }, []);

  const rejectRequest = useCallback(async (requestId: string, toUserId: string) => {
    setLoading(true); setError(null);
    try {
      await postFriendAction('reject', { requestId });
      return true;
    } catch (err: any) { setError(err.message || 'Failed'); return false; }
    finally { setLoading(false); }
  }, []);

  return { acceptRequest, rejectRequest, loading, error };
}

export function useRemoveFriend() {
  const [loading, setLoading] = useState(false);
  const removeFriend = useCallback(async (userId: string, friendId: string) => {
    setLoading(true);
    try {
      await postFriendAction('remove', { friendUid: friendId });
      return true;
    } catch { return false; }
    finally { setLoading(false); }
  }, []);
  return { removeFriend, loading };
}

export function useBlockUser() {
  const [loading, setLoading] = useState(false);
  const blockUser = useCallback(async (userId: string, targetId: string, username: string, photoURL?: string) => {
    setLoading(true);
    try {
      await postFriendAction('block', { targetUid: targetId });
      return true;
    } catch { return false; }
    finally { setLoading(false); }
  }, []);
  return { blockUser, loading };
}

export function useUnblockUser() {
  const [loading, setLoading] = useState(false);
  const unblockUser = useCallback(async (userId: string, targetId: string) => {
    setLoading(true);
    try {
      const { firestore: db } = initializeFirebase();
      if (!db) return false;
      await deleteDoc(doc(db, 'users', userId, 'blocked', targetId));
      return true;
    } catch { return false; }
    finally { setLoading(false); }
  }, []);
  return { unblockUser, loading };
}

export function useFriendRequestsReceived(userId: string | null) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!userId) { setRequests([]); setLoading(false); return; }
    setLoading(true);
    let unsub: (() => void) | null = null;
    const { firestore: db } = initializeFirebase();
    if (!db) { setLoading(false); return; }
    const q = query(collection(db, 'users', userId, 'friendRequests'), orderBy('createdAt', 'desc'));
    unsub = onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
      setRequests(snap.docs.filter((d: QueryDocumentSnapshot<DocumentData>) => d.data().status === 'pending').map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => { setLoading(false); });
    return () => { if (unsub) unsub(); };
  }, [userId]);
  return { requests, loading };
}
