import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';
import {
  countSolvedFromAccepted,
  getWeeklyWindow,
  isWeeklyActive,
  isWeeklyChallenge,
} from '@/lib/challenges';

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

  const limited = await enforceSharedRateLimit(uid, 'challenges.weekly.claim', {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (limited) return limited;

  try {
    const now = new Date();
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    const progressRef = userRef.collection('challenges').doc('weekly');
    const challengeRef = db.collection('challenges').doc('weekly');

    const result = await db.runTransaction(async (tx) => {
      const challengeSnap = await tx.get(challengeRef);
      const weekly = challengeSnap.data();
      if (!isWeeklyChallenge(weekly) || !isWeeklyActive(weekly, now)) {
        return { error: 'No active weekly challenge is configured.', status: 404 } as const;
      }
      const window = getWeeklyWindow(weekly);
      if (!window) {
        return { error: 'Weekly challenge window is invalid.', status: 409 } as const;
      }

      const claimRef = progressRef.collection('claims').doc(weekly.week);
      const [submissionSnap, claimSnap, progressSnap, userSnap] = await Promise.all([
        tx.get(userRef.collection('submissions')
          .where('submittedAt', '>=', Timestamp.fromDate(window.start))
          .where('submittedAt', '<', Timestamp.fromDate(window.end))),
        tx.get(claimRef),
        tx.get(progressRef),
        tx.get(userRef),
      ]);

      if (!userSnap.exists) {
        return { error: 'User profile not found.', status: 404 } as const;
      }

      const accepted = new Set(submissionSnap.docs.flatMap((doc) => {
        const data = doc.data();
        return data.verdict === 'Accepted' && typeof data.problemId === 'string'
          ? [data.problemId]
          : [];
      }));
      const solved = countSolvedFromAccepted(accepted, weekly.problemIds);
      if (solved.length !== weekly.problemIds.length) {
        return {
          error: 'Solve every weekly challenge problem before claiming its reward.',
          status: 409,
          solved: solved.length,
          total: weekly.problemIds.length,
        } as const;
      }

      if (claimSnap.exists
        || (progressSnap.exists
          && progressSnap.data()?.week === weekly.week
          && progressSnap.data()?.claimed === true)) {
        return { alreadyClaimed: true, xpAwarded: 0, solved: solved.length, total: weekly.problemIds.length } as const;
      }

      tx.set(progressRef, {
        week: weekly.week,
        problemIds: weekly.problemIds,
        solved,
        claimed: true,
        xpEarned: weekly.xpBonus,
        claimedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.create(claimRef, {
        week: weekly.week,
        xpEarned: weekly.xpBonus,
        claimedAt: FieldValue.serverTimestamp(),
      });
      tx.update(userRef, {
        xp: FieldValue.increment(weekly.xpBonus),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(db.collection('learning').doc(uid), {
        xp: FieldValue.increment(weekly.xpBonus),
        lastSynced: FieldValue.serverTimestamp(),
      }, { merge: true });

      return {
        alreadyClaimed: false,
        xpAwarded: weekly.xpBonus,
        solved: solved.length,
        total: weekly.problemIds.length,
      } as const;
    });

    if ('error' in result) {
      const { error, status, ...details } = result;
      return NextResponse.json({ error, ...details }, { status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Weekly Challenge Claim POST] Failed to claim weekly challenge', error);
    return NextResponse.json({ error: 'Unable to claim the weekly challenge reward.' }, { status: 500 });
  }
}
