import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';
import { getChatId } from '@/config/chat';

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let uid: string;
  try {
    ({ uid } = await getAdminAuth().verifyIdToken(authorization.slice(7)));
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
  const limited = await enforceSharedRateLimit(uid, 'chat.create', { windowMs: 60_000, maxRequests: 20 });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const otherUid = body?.otherUid;
  if (typeof otherUid !== 'string' || !otherUid || otherUid.length > 128 || otherUid === uid) {
    return NextResponse.json({ error: 'Invalid conversation participant.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const chatId = getChatId(uid, otherUid);
    const chatRef = db.collection('chats').doc(chatId);
    const ownRef = db.collection('users').doc(uid);
    const otherRef = db.collection('users').doc(otherUid);
    const [chatSnap, ownSnap, otherSnap, ownFriend, otherFriend] = await Promise.all([
      chatRef.get(), ownRef.get(), otherRef.get(),
      ownRef.collection('friends').doc(otherUid).get(),
      otherRef.collection('friends').doc(uid).get(),
    ]);

    if (chatSnap.exists) {
      const participants = chatSnap.data()?.participants;
      if (!Array.isArray(participants) || !participants.includes(uid) || !participants.includes(otherUid)) {
        return NextResponse.json({ error: 'Conversation access denied.' }, { status: 403 });
      }
      return NextResponse.json({ chatId });
    }
    if (!ownSnap.exists || !otherSnap.exists) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (!ownFriend.exists || !otherFriend.exists) {
      return NextResponse.json({ error: 'You can message accepted friends only.' }, { status: 403 });
    }
    if (ownSnap.data()?.banned === true || otherSnap.data()?.banned === true) {
      return NextResponse.json({ error: 'Conversation unavailable.' }, { status: 403 });
    }

    const participants = [uid, otherUid].sort();
    const profileData = Object.fromEntries(participants.map((participantId) => {
      const data = participantId === uid ? ownSnap.data()! : otherSnap.data()!;
      return [participantId, {
        username: typeof data.username === 'string' ? data.username : 'User',
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
      }];
    }));
    await db.runTransaction(async (tx) => {
      const [existing, ownFriendFresh, otherFriendFresh] = await Promise.all([
        tx.get(chatRef),
        tx.get(ownRef.collection('friends').doc(otherUid)),
        tx.get(otherRef.collection('friends').doc(uid)),
      ]);
      if (existing.exists) return;
      if (!ownFriendFresh.exists || !otherFriendFresh.exists) {
        throw new Error('You can message accepted friends only.');
      }
      tx.create(chatRef, {
        type: 'one-to-one',
        participants,
        participantData: profileData,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessage: null,
        lastMessageSenderId: null,
        lastMessageAt: null,
        unreadCount: { [uid]: 0, [otherUid]: 0 },
      });
    });
    return NextResponse.json({ chatId });
  } catch (error) {
    console.error('[Chats POST] Failed to create conversation.', error);
    return NextResponse.json({ error: 'Conversation service is temporarily unavailable.' }, { status: 503 });
  }
}
