'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { initializeFirebase } from '@/firebase';
import {
  collection, doc, updateDoc, query, onSnapshot, orderBy, limit,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData, QuerySnapshot } from 'firebase/firestore';
import { Notification } from '@/app/lib/types';

export function useNotifications(userId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const soundEnabledRef = useRef(true);

  useEffect(() => {
    if (!userId) { setNotifications([]); setLoading(false); return; }
    setLoading(true);
    let unsub: (() => void) | null = null;
    const { firestore: db } = initializeFirebase();
    if (!db) { setLoading(false); return; }
    let firstSnapshot = true;
    const preferenceUnsubscribe = onSnapshot(doc(db, 'users', userId), (snapshot) => {
      soundEnabledRef.current = snapshot.data()?.notificationPreferences?.soundEnabled !== false;
    });
    const q = query(collection(db, 'users', userId, 'notifications'), orderBy('createdAt', 'desc'), limit(50));
    unsub = onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
      const notifs: Notification[] = snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as Notification));
      if (!firstSnapshot && soundEnabledRef.current
        && snap.docChanges().some((change) => change.type === 'added')) {
        playNotificationTone();
      }
      firstSnapshot = false;
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
      setLoading(false);
    }, () => { setLoading(false); });
    return () => {
      if (unsub) unsub();
      preferenceUnsubscribe();
    };
  }, [userId]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!userId) return;
    try {
      const { firestore: db } = initializeFirebase();
      if (!db) return;
      await updateDoc(doc(db, 'users', userId, 'notifications', notificationId), { read: true });
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  }, [userId]);

  const markAllAsRead = useCallback(async () => {
    if (!userId) return;
    try {
      const { firestore: db } = initializeFirebase();
      if (!db) return;
      const unread = notifications.filter(n => !n.read);
      await Promise.all(unread.map(n => updateDoc(doc(db, 'users', userId, 'notifications', n.id), { read: true }).catch((err: Error) => console.error('[Notifications] Failed to mark as read', err))));
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  }, [userId, notifications]);

  return { notifications, loading, unreadCount, markAsRead, markAllAsRead };
}

function playNotificationTone() {
  if (typeof window === 'undefined') return;
  const AudioContextConstructor = window.AudioContext;
  if (!AudioContextConstructor) return;
  try {
    const context = new AudioContextConstructor();
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.frequency.value = 660;
    volume.gain.setValueAtTime(0.06, context.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.12);
    oscillator.onended = () => { void context.close(); };
  } catch (error) {
    console.warn('[Notifications] Unable to play notification tone', error);
  }
}
