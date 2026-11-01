import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

type Action = 'send' | 'accept' | 'reject' | 'remove' | 'block';

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

  const rate = checkRateLimit(uid, request, { windowMs: 60_000, maxRequests: 30 });
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterMs);

  const body = await request.json().catch(() => null);
  if (!body || !['send', 'accept', 'reject', 'remove', 'block'].includes(body.action)) {
    return NextResponse.json({ error: 'Invalid friend action.' }, { status: 400 });
  }

  const action = body.action as Action;
  const db = getAdminFirestore();
  const users = db.collection('users');
  const userRef = users.doc(uid);
  let requestSnapshot: FirebaseFirestore.DocumentSnapshot | null = null;
  if (action === 'accept' || action === 'reject') {
    if (typeof body.requestId !== 'string' || body.requestId.length < 1 || body.requestId.length > 128) {
      return NextResponse.json({ error: 'Invalid friend request.' }, { status: 400 });
    }
    requestSnapshot = await userRef.collection('friendRequests').doc(body.requestId).get();
    if (!requestSnapshot.exists || requestSnapshot.data()?.toUserId !== uid) {
      return NextResponse.json({ error: 'Pending request not found.' }, { status: 404 });
    }
  }
  const otherUid = action === 'accept' || action === 'reject'
    ? requestSnapshot?.data()?.fromUserId
    : action === 'remove' ? body.friendUid : action === 'block' ? body.targetUid : body.toUserId;
  if (typeof otherUid !== 'string' || otherUid.length < 1 || otherUid.length > 128 || otherUid === uid) {
    return NextResponse.json({ error: 'Invalid user identifier.' }, { status: 400 });
  }

  const otherRef = users.doc(otherUid);
  const ownFriendRef = userRef.collection('friends').doc(otherUid);
  const otherFriendRef = otherRef.collection('friends').doc(uid);
  const requestRef = action === 'send'
    ? otherRef.collection('friendRequests').doc(uid)
    : userRef.collection('friendRequests').doc(body.requestId);
  const ownBlockRef = userRef.collection('blocked').doc(otherUid);
  const otherBlockRef = otherRef.collection('blocked').doc(uid);

  try {
    if (action === 'block') {
      const result = await db.runTransaction(async (tx) => {
        const [ownProfile, otherProfile, ownBlock, ownFriend, otherFriend] = await Promise.all([
          tx.get(userRef), tx.get(otherRef), tx.get(ownBlockRef), tx.get(ownFriendRef), tx.get(otherFriendRef),
        ]);
        if (!ownProfile.exists || !otherProfile.exists) return false;
        if (!ownBlock.exists) {
          tx.create(ownBlockRef, {
            blockedUserId: otherUid,
            username: typeof otherProfile.data()?.username === 'string' ? otherProfile.data()!.username : 'Player',
            photoURL: typeof otherProfile.data()?.photoURL === 'string' ? otherProfile.data()!.photoURL : '',
            blockedAt: FieldValue.serverTimestamp(),
          });
        }
        if (ownFriend.exists) tx.delete(ownFriendRef);
        if (otherFriend.exists) tx.delete(otherFriendRef);
        return true;
      });
      if (!result) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    if (action === 'send') {
      const notificationRef = otherRef.collection('notifications').doc();
      const result = await db.runTransaction(async (tx) => {
        const [ownProfile, otherProfile, ownFriend, otherFriend, ownBlock, otherBlock, pendingRequest, legacyPending] =
          await Promise.all([
            tx.get(userRef), tx.get(otherRef), tx.get(ownFriendRef), tx.get(otherFriendRef),
            tx.get(ownBlockRef), tx.get(otherBlockRef), tx.get(requestRef),
            tx.get(otherRef.collection('friendRequests')
              .where('fromUserId', '==', uid).where('status', '==', 'pending').limit(1)),
          ]);
        if (!ownProfile.exists || !otherProfile.exists) return 'not-found' as const;
        if (ownBlock.exists || otherBlock.exists) return 'blocked' as const;
        if (ownFriend.exists || otherFriend.exists) return 'already-friends' as const;
        if ((pendingRequest.exists && pendingRequest.data()?.status === 'pending') || !legacyPending.empty) {
          return 'duplicate' as const;
        }

        const sender = ownProfile.data()!;
        tx.set(requestRef, {
          fromUserId: uid,
          fromUsername: typeof sender.username === 'string' ? sender.username : 'Player',
          fromPhotoURL: typeof sender.photoURL === 'string' ? sender.photoURL : '',
          toUserId: otherUid,
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
        });
        if (otherProfile.data()?.notificationPreferences?.inAppEnabled !== false) {
          tx.create(notificationRef, {
            userId: otherUid,
            type: 'friend_request',
            title: 'New Friend Request',
            message: `${typeof sender.username === 'string' ? sender.username : 'A player'} sent you a friend request.`,
            data: { fromUserId: uid },
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        return 'sent' as const;
      });

      if (result !== 'sent') {
        const status = result === 'not-found' ? 404 : result === 'blocked' ? 403 : 409;
        return NextResponse.json({ error: result }, { status });
      }
      return NextResponse.json({ success: true, status: 'pending' });
    }

    if (action === 'accept') {
      const notificationRef = otherRef.collection('notifications').doc();
      const result = await db.runTransaction(async (tx) => {
        const [requestSnap, ownProfile, otherProfile, ownFriend, otherFriend, ownBlock, otherBlock] =
          await Promise.all([
            tx.get(requestRef), tx.get(userRef), tx.get(otherRef), tx.get(ownFriendRef),
            tx.get(otherFriendRef), tx.get(ownBlockRef), tx.get(otherBlockRef),
          ]);
        if (!requestSnap.exists || requestSnap.data()?.status !== 'pending'
          || requestSnap.data()?.fromUserId !== otherUid
          || requestSnap.data()?.toUserId !== uid) return 'invalid-request' as const;
        if (!ownProfile.exists || !otherProfile.exists) return 'not-found' as const;
        if (ownBlock.exists || otherBlock.exists) return 'blocked' as const;
        if (ownFriend.exists || otherFriend.exists) return 'already-friends' as const;

        const own = ownProfile.data()!;
        const other = otherProfile.data()!;
        const friendData = (profile: FirebaseFirestore.DocumentData, ownerUid: string, friendUid: string) => ({
          userId: ownerUid,
          friendId: friendUid,
          username: typeof profile.username === 'string' ? profile.username : 'Player',
          photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : '',
          rating: typeof profile.rating === 'number' ? profile.rating : 0,
          tier: typeof profile.tier === 'string' ? profile.tier : 'Beginner',
          onlineStatus: typeof profile.onlineStatus === 'string' ? profile.onlineStatus : 'offline',
          status: 'accepted',
          addedAt: FieldValue.serverTimestamp(),
        });

        tx.update(requestRef, {
          status: 'accepted',
          acceptedAt: FieldValue.serverTimestamp(),
        });
        tx.create(ownFriendRef, friendData(other, uid, otherUid));
        tx.create(otherFriendRef, friendData(own, otherUid, uid));
        if (other.notificationPreferences?.inAppEnabled !== false) {
          tx.create(notificationRef, {
            userId: otherUid,
            type: 'friend_accepted',
            title: 'Friend Request Accepted',
            message: `${typeof own.username === 'string' ? own.username : 'A player'} accepted your friend request.`,
            data: { friendId: uid },
            read: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        return 'accepted' as const;
      });
      if (result !== 'accepted') {
        const status = result === 'not-found' ? 404 : result === 'blocked' ? 403 : 409;
        return NextResponse.json({ error: result }, { status });
      }
      return NextResponse.json({ success: true, status: 'accepted' });
    }

    if (action === 'reject') {
      const result = await db.runTransaction(async (tx) => {
        const requestSnap = await tx.get(requestRef);
        if (!requestSnap.exists || requestSnap.data()?.status !== 'pending'
          || requestSnap.data()?.fromUserId !== otherUid
          || requestSnap.data()?.toUserId !== uid) return false;
        tx.update(requestRef, { status: 'rejected', rejectedAt: FieldValue.serverTimestamp() });
        return true;
      });
      if (!result) return NextResponse.json({ error: 'Pending request not found.' }, { status: 404 });
      return NextResponse.json({ success: true, status: 'rejected' });
    }

    const removed = await db.runTransaction(async (tx) => {
      const [ownFriend, otherFriend] = await Promise.all([tx.get(ownFriendRef), tx.get(otherFriendRef)]);
      if (!ownFriend.exists || !otherFriend.exists) return false;
      tx.delete(ownFriendRef);
      tx.delete(otherFriendRef);
      return true;
    });
    if (!removed) return NextResponse.json({ error: 'Friendship not found.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Friends POST] Operation failed', error);
    return NextResponse.json({ error: 'Unable to complete friend operation.' }, { status: 500 });
  }
}
