import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

function createCode() {
  return `DR-${randomBytes(6).toString('hex').toUpperCase()}`;
}

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    ({ uid } = await getAdminAuth().verifyIdToken(authorization.slice(7)));
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const limited = await enforceSharedRateLimit(uid, 'referrals.code', { windowMs: 60_000, maxRequests: 5 });
  if (limited) return limited;

  try {
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    for (let attempt = 0; attempt < 3; attempt++) {
      const generatedCode = createCode();
      const result = await db.runTransaction(async (tx) => {
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists || userSnap.data()?.banned === true) return { error: 'Account unavailable.' } as const;

        const existingCode = userSnap.data()?.referralCode;
        const code = typeof existingCode === 'string' && existingCode.length > 0
          ? existingCode
          : generatedCode;
        const referralRef = db.collection('referrals').doc(code);
        const referralSnap = await tx.get(referralRef);
        if (referralSnap.exists) {
          if (referralSnap.data()?.userId === uid) return { code } as const;
          if (typeof existingCode === 'string' && existingCode.length > 0) {
            return { error: 'Existing referral code is unavailable.' } as const;
          }
          return { collision: true } as const;
        }

        tx.create(referralRef, {
          userId: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
        if (typeof existingCode !== 'string' || existingCode.length === 0) {
          tx.update(userRef, { referralCode: code, updatedAt: FieldValue.serverTimestamp() });
        }
        return { code } as const;
      });

      if ('code' in result) return NextResponse.json({ success: true, code: result.code });
      if (!('collision' in result)) return NextResponse.json({ error: result.error }, { status: 403 });
    }

    return NextResponse.json({ error: 'Unable to reserve a referral code.' }, { status: 503 });
  } catch (error) {
    console.error('[Referral Code POST] Failed to create code.', error);
    return NextResponse.json({ error: 'Referral code service is temporarily unavailable.' }, { status: 503 });
  }
}
