'use client';

import { initializeFirebase } from '@/firebase';
import {
  doc, getDoc, getDocs, collection, query, where, orderBy, limit,
  onSnapshot, startAfter, documentId, Timestamp,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData, QuerySnapshot } from 'firebase/firestore';
import {
  getStorage, getDownloadURL, ref, uploadBytes,
} from 'firebase/storage';
import type {
  ChatDoc, ChatMessage, MessageType, ReplyTo,
} from '@/config/chat';
import { MESSAGE_BATCH_SIZE } from '@/config/chat';

function chatRef(chatId: string) {
  const { firestore: db } = initializeFirebase();
  return db ? doc(db, 'chats', chatId) : null;
}

function messagesColRef(chatId: string) {
  const { firestore: db } = initializeFirebase();
  return db ? collection(db, 'chats', chatId, 'messages') : null;
}

// ===== CREATE CHAT =====

export async function createOrGetChat(uid1: string, uid2: string): Promise<string | null> {
  const { auth } = initializeFirebase();
  const currentUser = auth?.currentUser;
  if (!currentUser || currentUser.uid !== uid1 || !uid2) return null;
  const response = await fetch('/api/chats', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await currentUser.getIdToken()}`,
    },
    body: JSON.stringify({ otherUid: uid2 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Unable to open conversation.');
  return data.chatId as string;
}

async function postChatAction(chatId: string, action: string, values: Record<string, unknown> = {}) {
  const user = initializeFirebase().auth?.currentUser;
  if (!user) throw new Error('Sign in to use chat.');
  const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify({ action, ...values }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Chat operation failed.');
  return data;
}

// ===== SEND MESSAGE =====

export async function sendMessage(
  chatId: string, senderId: string,
  text: string, type: MessageType = 'text',
  replyTo: ReplyTo | null = null,
  file?: File,
): Promise<string | null> {
  const { app, auth } = initializeFirebase();
  if (!auth?.currentUser || auth.currentUser.uid !== senderId) throw new Error('Invalid chat sender.');
  const storage = app ? getStorage(app) : null;

  let fileUrl: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;

  if (file && storage) {
    const storageRef = ref(storage, `chat-files/${chatId}/${Date.now()}_${file.name}`);
    const uploadResult = await uploadBytes(storageRef, file);
    fileUrl = await getDownloadURL(uploadResult.ref);
    fileName = file.name;
    fileSize = file.size;
  }

  const result = await postChatAction(chatId, 'send', {
    clientMessageId: crypto.randomUUID(),
    text,
    type,
    replyTo,
    fileUrl,
    fileName,
    fileSize,
  });
  return result.id as string;
}

// ===== MARK READ =====

export async function markChatRead(chatId: string, userId: string): Promise<void> {
  const user = initializeFirebase().auth?.currentUser;
  if (!user || user.uid !== userId) throw new Error('Invalid chat user.');
  await postChatAction(chatId, 'readAll');
}

// ===== EDIT MESSAGE =====

export async function editMessage(chatId: string, messageId: string, newText: string): Promise<void> {
  await postChatAction(chatId, 'edit', { messageId, text: newText });
}

// ===== DELETE MESSAGE =====

export async function deleteMessage(chatId: string, messageId: string): Promise<void> {
  await postChatAction(chatId, 'delete', { messageId });
}

// ===== REACT TO MESSAGE =====

export async function toggleReaction(chatId: string, messageId: string, userId: string, emoji: string): Promise<void> {
  const user = initializeFirebase().auth?.currentUser;
  if (!user || user.uid !== userId) throw new Error('Invalid chat user.');
  await postChatAction(chatId, 'reaction', { messageId, emoji });
}

// ===== READ RECEIPT =====

export async function markMessageRead(chatId: string, messageId: string, userId: string): Promise<void> {
  const user = initializeFirebase().auth?.currentUser;
  if (!user || user.uid !== userId) throw new Error('Invalid chat user.');
  await postChatAction(chatId, 'read', { messageId });
}

// ===== TYPING INDICATOR =====

export async function setTypingStatus(chatId: string, userId: string, typing: boolean): Promise<void> {
  const user = initializeFirebase().auth?.currentUser;
  if (!user || user.uid !== userId) throw new Error('Invalid chat user.');
  await postChatAction(chatId, 'typing', { typing });
}

// ===== REAL-TIME SUBSCRIPTIONS =====

export function subscribeChatList(
  userId: string,
  onData: (chats: ChatDoc[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const { firestore: db } = initializeFirebase();
  if (!db) return () => {};
  const q = query(
    collection(db, 'chats'),
    where('participants', 'array-contains', userId),
    orderBy('updatedAt', 'desc'),
  );
  return onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
    const list: ChatDoc[] = [];
    snap.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
      const data = d.data();
      if (!Array.isArray(data.hiddenFor) || !data.hiddenFor.includes(userId)) {
        list.push({ id: d.id, ...data } as ChatDoc);
      }
    });
    onData(list);
  }, onError);
}

export function subscribeMessages(
  chatId: string,
  onData: (messages: ChatMessage[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const ref = messagesColRef(chatId);
  if (!ref) return () => {};
  const q = query(ref, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(MESSAGE_BATCH_SIZE));
  return onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
    const list: ChatMessage[] = [];
    snap.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
      list.push({ id: d.id, ...d.data() } as ChatMessage);
    });
    onData(list.reverse());
  }, onError);
}

export function subscribeTyping(
  chatId: string,
  myId: string,
  onData: (typingUsers: string[]) => void,
): () => void {
  const { firestore: db } = initializeFirebase();
  if (!db) return () => {};
  const q = query(collection(db, 'chats', chatId, 'typing'), where('typing', '==', true));
  return onSnapshot(q, (snap: QuerySnapshot<DocumentData>) => {
    const users: string[] = [];
    snap.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
      const expiresAt = d.data().expiresAt as Timestamp | undefined;
      if (d.id !== myId && expiresAt && expiresAt.toMillis() > Date.now()) users.push(d.id);
    });
    onData(users);
  });
}

// ===== SEARCH MESSAGES =====

export async function searchMessages(
  chatId: string, queryText: string,
): Promise<ChatMessage[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const ref = messagesColRef(chatId);
  if (!ref) return [];
  const q = query(ref, orderBy('createdAt', 'desc'), limit(200));
  const snap = await getDocs(q);
  const results: ChatMessage[] = [];
  const lower = queryText.toLowerCase();
  snap.forEach((d: { id: string; data: () => any }) => {
    const msg = d.data() as ChatMessage;
    if (msg.text?.toLowerCase().includes(lower) && !msg.deleted) {
      results.push({ ...msg, id: d.id });
    }
  });
  return results.slice(0, 50);
}

// ===== LOAD MORE MESSAGES (pagination) =====

export async function loadMoreMessages(
  chatId: string, oldestId: string | null,
): Promise<ChatMessage[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const ref = messagesColRef(chatId);
  if (!ref) return [];
  let q;
  if (oldestId) {
    const oldestSnap = await getDoc(doc(db, 'chats', chatId, 'messages', oldestId));
    if (!oldestSnap.exists()) return [];
    q = query(ref, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), startAfter(oldestSnap), limit(MESSAGE_BATCH_SIZE));
  } else {
    q = query(ref, orderBy('createdAt', 'desc'), orderBy(documentId(), 'desc'), limit(MESSAGE_BATCH_SIZE));
  }
  const snap = await getDocs(q);
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ ...d.data(), id: d.id } as ChatMessage)).reverse();
}

// ===== GET USER PROFILE (for chat header) =====

export async function getUserProfile(userId: string): Promise<{ username: string; photoURL: string; onlineStatus: string } | null> {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  const currentUser = initializeFirebase().auth?.currentUser;
  if (!currentUser) return null;
  if (currentUser.uid === userId) {
    return {
      username: currentUser.displayName || 'User',
      photoURL: currentUser.photoURL || '',
      onlineStatus: 'online',
    };
  }
  const friendSnap = await getDoc(doc(db, 'users', currentUser.uid, 'friends', userId));
  if (friendSnap.exists()) {
    const data = friendSnap.data();
    return {
      username: typeof data.username === 'string' ? data.username : 'User',
      photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
      onlineStatus: typeof data.onlineStatus === 'string' ? data.onlineStatus : 'offline',
    };
  }
  const token = await currentUser.getIdToken();
  const response = await fetch(`/api/public/profiles?uid=${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  const result = await response.json();
  const profile = result.profile;
  return {
    username: typeof profile.username === 'string' ? profile.username : 'User',
    photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : '',
    onlineStatus: typeof profile.onlineStatus === 'string' ? profile.onlineStatus : 'offline',
  };
}

// ===== DELETE CHAT (soft) =====

export async function deleteChat(chatId: string): Promise<void> {
  await postChatAction(chatId, 'hide');
}
