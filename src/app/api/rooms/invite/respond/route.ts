import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

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

  const rate = checkRateLimit(uid, request, { windowMs: 60_000, maxRequests: 20 });
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterMs);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.inviteId !== 'string' || body.inviteId.length < 1
    || body.inviteId.length > 128 || !['accepted', 'declined'].includes(body.status)) {
    return NextResponse.json({ error: 'Invalid invitation response.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const inviteRef = db.collection('invites').doc(body.inviteId);
    const updated = await db.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef);
      const invite = inviteSnap.data();
      if (!inviteSnap.exists || invite?.toUserId !== uid || invite.status !== 'pending') return false;
      tx.update(inviteRef, {
        status: body.status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return true;
    });

    if (!updated) return NextResponse.json({ error: 'Pending invitation not found.' }, { status: 404 });
    return NextResponse.json({ success: true, status: body.status });
  } catch (error) {
    console.error('[Room Invite Response POST] Failed to respond to invitation', error);
    return NextResponse.json({ error: 'Unable to respond to room invitation.' }, { status: 500 });
  }
}
