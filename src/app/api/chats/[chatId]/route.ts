import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

type Params = { params: Promise<{ chatId: string }> };
type Action = 'send' | 'read' | 'readAll' | 'edit' | 'delete' | 'reaction' | 'typing' | 'hide';

export async function POST(request: NextRequest, { params }: Params) {
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
  const limited = await enforceSharedRateLimit(uid, 'chat.message', { windowMs: 60_000, maxRequests: 60 });
  if (limited) return limited;

  const { chatId } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action as Action;
  if (!body || !['send', 'read', 'readAll', 'edit', 'delete', 'reaction', 'typing', 'hide'].includes(action)) {
    return NextResponse.json({ error: 'Invalid chat action.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const chatRef = db.collection('chats').doc(chatId);
    const chatSnap = await chatRef.get();
    const chat = chatSnap.data();
    if (!chatSnap.exists || !Array.isArray(chat?.participants) || !chat.participants.includes(uid)) {
      return NextResponse.json({ error: 'Conversation access denied.' }, { status: 403 });
    }

    if (action === 'typing') {
      if (typeof body.typing !== 'boolean') {
        return NextResponse.json({ error: 'typing must be a boolean.' }, { status: 400 });
      }
      const typingRef = chatRef.collection('typing').doc(uid);
      if (body.typing) {
        await typingRef.set({
          typing: true,
          updatedAt: FieldValue.serverTimestamp(),
          expiresAt: Timestamp.fromMillis(Date.now() + 5_000),
        });
      } else {
        await typingRef.delete();
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'readAll') {
      const recent = await chatRef.collection('messages')
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get();
      const batch = db.batch();
      recent.docs.forEach((message) => {
        if (message.data().senderId !== uid && !message.data().readBy?.includes(uid)) {
          batch.update(message.ref, { readBy: FieldValue.arrayUnion(uid) });
        }
      });
      batch.update(chatRef, { [`unreadCount.${uid}`]: 0 });
      await batch.commit();
      return NextResponse.json({ success: true });
    }

    if (action === 'hide') {
      await chatRef.update({ hiddenFor: FieldValue.arrayUnion(uid) });
      return NextResponse.json({ success: true });
    }

    if (action === 'send') {
      const text = body.text;
      const type = body.type === 'image' || body.type === 'file' ? body.type : 'text';
      if (typeof text !== 'string' || text.length > 4000 || (!text.trim() && !body.fileUrl)) {
        return NextResponse.json({ error: 'Message text must be 1–4000 characters.' }, { status: 400 });
      }
      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let fileSize: number | null = null;
      if (body.fileUrl !== undefined) {
        try {
          const parsed = new URL(body.fileUrl);
          if (parsed.protocol !== 'https:' || parsed.hostname !== 'firebasestorage.googleapis.com'
            || typeof body.fileName !== 'string' || body.fileName.length > 255
            || !Number.isInteger(body.fileSize) || body.fileSize < 0 || body.fileSize > 10_000_000) {
            throw new Error('Invalid attachment.');
          }
          fileUrl = parsed.toString();
          fileName = body.fileName;
          fileSize = body.fileSize;
        } catch {
          return NextResponse.json({ error: 'Invalid attachment.' }, { status: 400 });
        }
      }

      const clientMessageId = body.clientMessageId;
      if (typeof clientMessageId !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(clientMessageId)) {
        return NextResponse.json({ error: 'Invalid message identifier.' }, { status: 400 });
      }
      const messageRef = chatRef.collection('messages').doc(clientMessageId);
      const recipientUid = chat.participants.find((participant: string) => participant !== uid);
      let replyTo: { messageId: string; text: string; senderId: string } | null = null;
      if (body.replyTo !== null && body.replyTo !== undefined) {
        const replyId = body.replyTo?.messageId;
        if (typeof replyId !== 'string' || replyId.length > 128) {
          return NextResponse.json({ error: 'Invalid reply target.' }, { status: 400 });
        }
        const replySnap = await chatRef.collection('messages').doc(replyId).get();
        if (!replySnap.exists || replySnap.data()?.deleted) {
          return NextResponse.json({ error: 'Reply target not found.' }, { status: 404 });
        }
        const reply = replySnap.data()!;
        replyTo = {
          messageId: replyId,
          text: typeof reply.text === 'string' ? reply.text.slice(0, 500) : '',
          senderId: typeof reply.senderId === 'string' ? reply.senderId : '',
        };
      }
      const lastText = type === 'image' ? 'Image'
        : type === 'file' ? `File: ${fileName || 'attachment'}`
          : text.trim().slice(0, 100);
      await db.runTransaction(async (tx) => {
        const [fresh, existingMessage] = await Promise.all([tx.get(chatRef), tx.get(messageRef)]);
        const participants = fresh.data()?.participants;
        if (!fresh.exists || !Array.isArray(participants) || !participants.includes(uid)) {
          throw new Error('Conversation access denied.');
        }
        if (existingMessage.exists) {
          if (existingMessage.data()?.senderId === uid) return;
          throw new Error('Message identifier is already in use.');
        }
        tx.create(messageRef, {
          chatId,
          senderId: uid,
          text: text.trim(),
          type,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          edited: false,
          deleted: false,
          replyTo,
          reactions: {},
          readBy: [uid],
          fileUrl,
          fileName,
          fileSize,
        });
        tx.update(chatRef, {
          lastMessage: { text: lastText, senderId: uid, createdAt: FieldValue.serverTimestamp(), type },
          lastMessageSenderId: uid,
          lastMessageAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          [`unreadCount.${uid}`]: 0,
          ...(recipientUid ? { [`unreadCount.${recipientUid}`]: FieldValue.increment(1) } : {}),
        });
      });
      return NextResponse.json({ id: messageRef.id });
    }

    const messageId = body.messageId;
    if (typeof messageId !== 'string' || !messageId || messageId.length > 128) {
      return NextResponse.json({ error: 'Invalid message identifier.' }, { status: 400 });
    }
    const messageRef = chatRef.collection('messages').doc(messageId);

    if (action === 'read') {
      await db.runTransaction(async (tx) => {
        const [messageSnap, freshChat] = await Promise.all([tx.get(messageRef), tx.get(chatRef)]);
        if (!freshChat.exists || !freshChat.data()?.participants?.includes(uid)) {
          throw new Error('Conversation access denied.');
        }
        if (!messageSnap.exists || messageSnap.data()?.senderId === uid) return;
        tx.update(messageRef, { readBy: FieldValue.arrayUnion(uid) });
        tx.update(chatRef, { [`unreadCount.${uid}`]: 0 });
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'edit' || action === 'delete') {
      const text = action === 'edit' ? body.text : '';
      if (action === 'edit' && (typeof text !== 'string' || !text.trim() || text.length > 4000)) {
        return NextResponse.json({ error: 'Edited message must be 1–4000 characters.' }, { status: 400 });
      }
      const result = await db.runTransaction(async (tx) => {
        const [messageSnap, freshChat] = await Promise.all([tx.get(messageRef), tx.get(chatRef)]);
        const message = messageSnap.data();
        if (!freshChat.exists || !freshChat.data()?.participants?.includes(uid)) return 'forbidden';
        if (!messageSnap.exists || message?.senderId !== uid || message.deleted) return 'not-found';
        const createdAt = message.createdAt?.toMillis?.() as number | undefined;
        if (!createdAt || Date.now() - createdAt > 15 * 60_000) return 'expired';
        tx.update(messageRef, action === 'edit'
          ? { text: text.trim(), edited: true, updatedAt: FieldValue.serverTimestamp() }
          : { deleted: true, text: '', updatedAt: FieldValue.serverTimestamp() });
        return 'updated';
      });
      if (result !== 'updated') {
        const status = result === 'forbidden' ? 403 : result === 'expired' ? 409 : 404;
        return NextResponse.json({ error: result === 'expired' ? 'Message edit window expired.' : 'Message not found.' }, { status });
      }
      return NextResponse.json({ success: true });
    }

    const emoji = body.emoji;
    if (typeof emoji !== 'string' || emoji.length < 1 || emoji.length > 16) {
      return NextResponse.json({ error: 'Invalid reaction.' }, { status: 400 });
    }
    const reactionResult = await db.runTransaction(async (tx) => {
      const [messageSnap, freshChat] = await Promise.all([tx.get(messageRef), tx.get(chatRef)]);
      if (!freshChat.exists || !freshChat.data()?.participants?.includes(uid)) return 'forbidden';
      if (!messageSnap.exists || messageSnap.data()?.deleted) return 'not-found';
      const reactions = messageSnap.data()?.reactions || {};
      const users: string[] = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];
      const updated = users.includes(uid) ? users.filter((id) => id !== uid) : [...users, uid];
      tx.update(messageRef, {
        [`reactions.${emoji}`]: updated,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return 'updated';
    });
    if (reactionResult !== 'updated') {
      return NextResponse.json({ error: 'Message not found.' }, { status: reactionResult === 'forbidden' ? 403 : 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Chat POST] Operation failed.', error);
    return NextResponse.json({ error: 'Chat service is temporarily unavailable.' }, { status: 503 });
  }
}
