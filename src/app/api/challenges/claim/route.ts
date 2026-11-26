import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';
import { hasAcceptedSubmissionForProblemOnDay } from '@/lib/daily-missions';

const MAX_DAILY_XP_BONUS = 1000;

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

  const limited = await enforceSharedRateLimit(uid, 'challenges.claim', { windowMs: 60_000, maxRequests: 10 });
  if (limited) return limited;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const dayStart = new Date(`${today}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    const learningRef = db.collection('learning').doc(uid);
    const challengeRef = db.collection('challenges').doc('daily');
    const submissionsRef = userRef.collection('submissions');
    const dailyProgressRef = userRef.collection('challenges').doc('daily');
    const claimRef = dailyProgressRef.collection('claims').doc(today);

    const result = await db.runTransaction(async (tx) => {
      const challengeSnap = await tx.get(challengeRef);
      const challenge = (challengeSnap.data()?.challenges || [])
        .find((item: Record<string, unknown>) => item?.date === today);
      if (!challenge || typeof challenge.problemId !== 'string'
        || typeof challenge.xpBonus !== 'number'
        || !Number.isInteger(challenge.xpBonus)
        || challenge.xpBonus < 0 || challenge.xpBonus > MAX_DAILY_XP_BONUS) {
        return { error: 'No valid daily challenge is active.', status: 404 } as const;
      }

      const [todaySubmissions, claimSnap, userSnap] = await Promise.all([
        tx.get(submissionsRef
          .where('submittedAt', '>=', Timestamp.fromDate(dayStart))
          .where('submittedAt', '<', Timestamp.fromDate(dayEnd))),
        tx.get(claimRef),
        tx.get(userRef),
      ]);
      if (!hasAcceptedSubmissionForProblemOnDay(
        todaySubmissions.docs.map((submission) => {
          const data = submission.data();
          return {
            problemId: data.problemId,
            verdict: data.verdict,
            submittedAt: data.submittedAt?.toDate(),
          };
        }),
        challenge.problemId,
        dayStart,
        dayEnd,
      )) {
        return { error: 'Solve the daily challenge before claiming its reward.', status: 409 } as const;
      }
      if (!userSnap.exists) return { error: 'User profile not found.', status: 404 } as const;
      if (claimSnap.exists) return { alreadyClaimed: true, xpAwarded: 0 } as const;

      tx.set(dailyProgressRef, {
        date: today,
        problemId: challenge.problemId,
        claimed: true,
        xpEarned: challenge.xpBonus,
        claimedAt: FieldValue.serverTimestamp(),
      });
      tx.create(claimRef, {
        date: today,
        problemId: challenge.problemId,
        xpEarned: challenge.xpBonus,
        claimedAt: FieldValue.serverTimestamp(),
      });
      tx.update(userRef, {
        xp: FieldValue.increment(challenge.xpBonus),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(learningRef, {
        xp: FieldValue.increment(challenge.xpBonus),
        lastSynced: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { alreadyClaimed: false, xpAwarded: challenge.xpBonus } as const;
    });

    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Daily Challenge Claim POST] Failed to claim challenge', error);
    return NextResponse.json({ error: 'Unable to claim the daily challenge reward.' }, { status: 500 });
  }
}
