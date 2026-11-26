import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

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

  const rateLimit = await enforceSharedRateLimit(uid, 'rooms.invite', { windowMs: 60_000, maxRequests: 20 });
  if (rateLimit) return rateLimit;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.roomId !== 'string' || typeof body.roomCode !== 'string'
    || typeof body.toUserId !== 'string' || !body.roomId || !body.toUserId || body.toUserId === uid) {
    return NextResponse.json({ error: 'Invalid room invitation.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const roomRef = db.collection('gameRooms').doc(body.roomId);
    const senderRef = db.collection('users').doc(uid);
    const recipientRef = db.collection('users').doc(body.toUserId);
    const senderBlockRef = senderRef.collection('blocked').doc(body.toUserId);
    const recipientBlockRef = recipientRef.collection('blocked').doc(uid);
    const inviteRef = db.collection('invites').doc();
    const notificationRef = recipientRef.collection('notifications').doc();

    const result = await db.runTransaction(async (tx) => {
      const [roomSnap, senderSnap, recipientSnap, senderBlock, recipientBlock] = await Promise.all([
        tx.get(roomRef), tx.get(senderRef), tx.get(recipientRef),
        tx.get(senderBlockRef), tx.get(recipientBlockRef),
      ]);
      if (!roomSnap.exists || !senderSnap.exists || !recipientSnap.exists) return 'not-found' as const;
      const room = roomSnap.data()!;
      if (room.status !== 'waiting' || room.roomCode !== body.roomCode
        || (room.hostId !== uid && !(Array.isArray(room.players) && room.players.includes(uid)))) {
        return 'forbidden' as const;
      }
      if (senderSnap.data()?.banned === true || recipientSnap.data()?.banned === true) {
        return 'forbidden' as const;
      }
      if (senderBlock.exists || recipientBlock.exists) return 'blocked' as const;

      const sender = senderSnap.data()!;
      const username = typeof sender.username === 'string' ? sender.username : 'Player';
      tx.create(inviteRef, {
        roomId: body.roomId,
        roomCode: body.roomCode,
        fromUserId: uid,
        fromUsername: username,
        toUserId: body.toUserId,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      });
      if (recipientSnap.data()?.notificationPreferences?.inAppEnabled !== false) {
        tx.create(notificationRef, {
          userId: body.toUserId,
          type: 'room_invite',
          title: 'Room Invite',
          message: `${username} invited you to join their room.`,
          data: { roomId: body.roomId, roomCode: body.roomCode, fromUserId: uid, fromUsername: username },
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return 'sent' as const;
    });

    if (result !== 'sent') {
      const status = result === 'not-found' ? 404 : result === 'blocked' ? 403 : 403;
      return NextResponse.json({ error: result }, { status });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Room Invite POST] Failed to send invitation', error);
    return NextResponse.json({ error: 'Unable to send room invitation.' }, { status: 500 });
  }
}
