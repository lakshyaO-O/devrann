import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    ({ uid } = await getAdminAuth().verifyIdToken(authorization.slice(7)));
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const limited = await enforceSharedRateLimit(uid, 'referrals.apply', { windowMs: 60_000, maxRequests: 5 });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!/^[A-Z0-9-]{8,32}$/.test(code)) {
    return NextResponse.json({ error: 'Invalid referral code.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const referralRef = db.collection('referrals').doc(code);
    const userRef = db.collection('users').doc(uid);
    const result = await db.runTransaction(async (tx) => {
      const referralSnap = await tx.get(referralRef);
      if (!referralSnap.exists) return { error: 'Referral code not found.', status: 404 } as const;
      const referrerId = referralSnap.data()?.userId;
      if (typeof referrerId !== 'string' || referrerId === uid) {
        return { error: 'This referral code cannot be applied.', status: 400 } as const;
      }

      const referrerRef = db.collection('users').doc(referrerId);
      const [userSnap, referrerSnap] = await Promise.all([tx.get(userRef), tx.get(referrerRef)]);
      if (!userSnap.exists || !referrerSnap.exists
        || userSnap.data()?.banned === true || referrerSnap.data()?.banned === true) {
        return { error: 'Account unavailable.', status: 403 } as const;
      }
      if (typeof userSnap.data()?.referredBy === 'string') {
        return { error: 'A referral code has already been applied.', status: 409 } as const;
      }

      const userLearningRef = db.collection('learning').doc(uid);
      const referrerLearningRef = db.collection('learning').doc(referrerId);
      tx.update(userRef, {
        coins: FieldValue.increment(50),
        xp: FieldValue.increment(25),
        referredBy: referrerId,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(referrerRef, {
        coins: FieldValue.increment(100),
        xp: FieldValue.increment(50),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(userLearningRef, {
        coins: FieldValue.increment(50),
        xp: FieldValue.increment(25),
        lastSynced: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(referrerLearningRef, {
        coins: FieldValue.increment(100),
        xp: FieldValue.increment(50),
        lastSynced: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { success: true } as const;
    });

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Referral Apply POST] Failed to apply code.', error);
    return NextResponse.json({ error: 'Referral service is temporarily unavailable.' }, { status: 503 });
  }
}
