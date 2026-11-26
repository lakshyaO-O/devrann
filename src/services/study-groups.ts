'use client';

import { initializeFirebase } from '@/firebase';
import {
  collection, query, orderBy, limit, startAfter, getDocs,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import type { StudyGroup, StudyGroupMessage } from '@/types';

async function postGroupAction(groupId: string, action: string, values: Record<string, unknown> = {}) {
  const user = initializeFirebase().auth?.currentUser;
  if (!user) throw new Error('Sign in to use study groups.');
  const response = await fetch(`/api/study-groups/${encodeURIComponent(groupId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ action, ...values }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Study group operation failed.');
  return data;
}

export async function createGroup(groupData: Omit<StudyGroup, 'id' | 'createdAt' | 'updatedAt' | 'memberCount'>) {
  const user = initializeFirebase().auth?.currentUser;
  if (!user) throw new Error('Sign in to create a study group.');
  const response = await fetch('/api/study-groups', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(groupData),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to create study group.');
  return data.id as string;
}

export async function joinGroup(groupId: string, userId: string) {
  const user = initializeFirebase().auth?.currentUser;
  if (!user || user.uid !== userId) throw new Error('Invalid group user.');
  await postGroupAction(groupId, 'join');
}

export async function leaveGroup(groupId: string, userId: string) {
  const user = initializeFirebase().auth?.currentUser;
  if (!user || user.uid !== userId) throw new Error('Invalid group user.');
  await postGroupAction(groupId, 'leave');
}

export async function getGroupMessages(
  groupId: string,
  lastDoc?: any,
): Promise<{ messages: StudyGroupMessage[]; lastDoc: any }> {
  const { firestore: db } = initializeFirebase();
  if (!db) return { messages: [], lastDoc: null };

  const constraints: any[] = [
    orderBy('createdAt', 'asc'),
    limit(50),
  ];
  if (lastDoc) constraints.unshift(startAfter(lastDoc));

  const q = query(collection(db, 'studyGroups', groupId, 'messages'), ...constraints);
  const snap = await getDocs(q);
  const docs = snap.docs;
  const messages = docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as StudyGroupMessage));
  return { messages, lastDoc: docs[docs.length - 1] || null };
}

export async function sendMessage(groupId: string, messageData: Omit<StudyGroupMessage, 'id' | 'createdAt' | 'groupId'>) {
  const result = await postGroupAction(groupId, 'send', { content: messageData.content });
  return result.id as string;
}

export async function searchGroups(
  queryStr: string,
  filters?: { topic?: string; isPublic?: boolean },
): Promise<StudyGroup[]> {
  const user = initializeFirebase().auth?.currentUser;
  if (!user) throw new Error('Sign in to search study groups.');
  const params = new URLSearchParams();
  if (filters?.topic) params.set('topic', filters.topic);
  if (filters?.isPublic !== undefined) params.set('isPublic', String(filters.isPublic));
  if (queryStr) params.set('search', queryStr);
  const response = await fetch(`/api/study-groups?${params}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to search study groups.');
  return data.groups as StudyGroup[];
}
