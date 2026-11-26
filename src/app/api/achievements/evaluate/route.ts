import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

const ACHIEVEMENTS = [
  { id: 'first_solve', title: 'First Blood', desc: 'Solve your first problem', icon: '🎯', xp: 50, threshold: 1 },
  { id: 'ten_solves', title: 'Double Digits', desc: 'Solve 10 problems', icon: '💪', xp: 100, threshold: 10 },
  { id: 'fifty_solves', title: 'Half Century', desc: 'Solve 50 problems', icon: '🔥', xp: 250, threshold: 50 },
  { id: 'hundred_solves', title: 'Century', desc: 'Solve 100 problems', icon: '🏆', xp: 500, threshold: 100 },
  { id: 'streak_3', title: 'Hat Trick', desc: '3-day streak', icon: '⚡', xp: 75, threshold: 3 },
  { id: 'streak_7', title: 'Weekly Warrior', desc: '7-day streak', icon: '🔥', xp: 200, threshold: 7 },
  { id: 'streak_30', title: 'Monthly Master', desc: '30-day streak', icon: '👑', xp: 500, threshold: 30 },
];

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let uid: string;
  try {
    ({ uid } = await getAdminAuth().verifyIdToken(authorization.slice(7)));
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const limited = await enforceSharedRateLimit(uid, 'achievements.evaluate', {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (limited) return limited;

  try {
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    const [userSnap, progressSnap, legacyProgressSnap] = await Promise.all([
      userRef.get(),
      userRef.collection('progress').get(),
      userRef.collection('practiceProgress').get(),
    ]);
    if (!userSnap.exists || userSnap.data()?.banned === true) {
      return NextResponse.json({ error: 'Account unavailable.' }, { status: 403 });
    }

    const solvedIds = new Set(
      [...progressSnap.docs, ...legacyProgressSnap.docs]
        .filter((item) => item.data().solved === true)
        .map((item) => item.id),
    );
    const solvedCount = solvedIds.size;
    const streak = Number(userSnap.data()?.dailyLoginStreak) || 0;
    const eligible = ACHIEVEMENTS.filter((achievement) =>
      achievement.id.startsWith('streak_')
        ? streak >= achievement.threshold
        : solvedCount >= achievement.threshold,
    );
    if (eligible.length === 0) return NextResponse.json({ achievements: [] });

    const learningRef = db.collection('learning').doc(uid);
    const result = await db.runTransaction(async (tx) => {
      const achievementRefs = eligible.map((achievement) =>
        userRef.collection('achievements').doc(achievement.id),
      );
      const [currentUser, ...existingAchievements] = await Promise.all([
        tx.get(userRef),
        ...achievementRefs.map((ref) => tx.get(ref)),
      ]);
      if (!currentUser.exists || currentUser.data()?.banned === true) {
        return { error: 'Account unavailable.' } as const;
      }

      const newlyEarned = eligible.filter((_, index) => !existingAchievements[index].exists);
      if (newlyEarned.length === 0) return { achievements: [] } as const;
      const xpAwarded = newlyEarned.reduce((sum, achievement) => sum + achievement.xp, 0);

      newlyEarned.forEach((achievement) => {
        tx.create(userRef.collection('achievements').doc(achievement.id), {
          ...achievement,
          earnedAt: FieldValue.serverTimestamp(),
          xpAwarded: achievement.xp,
        });
      });
      tx.update(userRef, {
        xp: FieldValue.increment(xpAwarded),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(learningRef, {
        xp: FieldValue.increment(xpAwarded),
        lastSynced: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { achievements: newlyEarned } as const;
    });

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 403 });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Achievements POST] Failed to evaluate achievements.', error);
    return NextResponse.json({ error: 'Achievement service is temporarily unavailable.' }, { status: 503 });
  }
}
