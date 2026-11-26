import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

type Params = { params: Promise<{ id: string }> };

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
  const limited = await enforceSharedRateLimit(uid, 'groups.action', { windowMs: 60_000, maxRequests: 60 });
  if (limited) return limited;

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (!body || !['join', 'leave', 'send'].includes(action)) {
    return NextResponse.json({ error: 'Invalid group action.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const groupRef = db.collection('studyGroups').doc(id);
    const groupSnap = await groupRef.get();
    const group = groupSnap.data();
    if (!groupSnap.exists || !group) return NextResponse.json({ error: 'Group not found.' }, { status: 404 });
    const memberIds: string[] = Array.isArray(group?.memberIds) ? group.memberIds : [];

    if (action === 'join') {
      if (group.isPublic !== true) return NextResponse.json({ error: 'This group is private.' }, { status: 403 });
      if (memberIds.includes(uid)) return NextResponse.json({ success: true });
      if (memberIds.length >= (Number(group.maxMembers) || 20)) {
        return NextResponse.json({ error: 'Group is full.' }, { status: 409 });
      }
      const userSnap = await db.collection('users').doc(uid).get();
      if (!userSnap.exists || userSnap.data()?.banned === true) {
        return NextResponse.json({ error: 'Account unavailable.' }, { status: 403 });
      }
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(groupRef);
        const data = fresh.data();
        const current: string[] = Array.isArray(data?.memberIds) ? data.memberIds : [];
        if (!fresh.exists || data?.isPublic !== true) throw new Error('Group is not joinable.');
        if (current.includes(uid)) return;
        if (current.length >= (Number(data.maxMembers) || 20)) throw new Error('Group is full.');
        tx.update(groupRef, {
          memberIds: FieldValue.arrayUnion(uid),
          memberCount: current.length + 1,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'leave') {
      if (group.createdBy === uid) {
        return NextResponse.json({ error: 'The owner cannot leave without transferring ownership.' }, { status: 409 });
      }
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(groupRef);
        const data = fresh.data();
        const current: string[] = Array.isArray(data?.memberIds) ? data.memberIds : [];
        if (!fresh.exists || !current.includes(uid)) return;
        tx.update(groupRef, {
          memberIds: FieldValue.arrayRemove(uid),
          adminIds: FieldValue.arrayRemove(uid),
          memberCount: Math.max(0, current.length - 1),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return NextResponse.json({ success: true });
    }

    if (!memberIds.includes(uid)) return NextResponse.json({ error: 'Group membership required.' }, { status: 403 });
    const content = body.content;
    if (typeof content !== 'string' || !content.trim() || content.length > 4000) {
      return NextResponse.json({ error: 'Message must be 1–4000 characters.' }, { status: 400 });
    }
    const userSnap = await db.collection('users').doc(uid).get();
    const user = userSnap.data();
    if (!userSnap.exists || !user || user.banned === true) return NextResponse.json({ error: 'Account unavailable.' }, { status: 403 });
    const messageRef = groupRef.collection('messages').doc();
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(groupRef);
      if (!fresh.exists || !fresh.data()?.memberIds?.includes(uid)) {
        throw new Error('Group membership required.');
      }
      tx.create(messageRef, {
        groupId: id,
        userId: uid,
        username: typeof user.username === 'string' ? user.username : 'User',
        photoURL: typeof user.photoURL === 'string' ? user.photoURL : '',
        content: content.trim(),
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(groupRef, { updatedAt: FieldValue.serverTimestamp() });
    });
    return NextResponse.json({ id: messageRef.id }, { status: 201 });
  } catch (error) {
    console.error('[Study Group POST] Action failed.', error);
    return NextResponse.json({ error: 'Group service is temporarily unavailable.' }, { status: 503 });
  }
}
