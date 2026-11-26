import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

const REWARDS = [
  { coins: 50, xp: 25 },
  { coins: 75, xp: 40 },
  { coins: 100, xp: 60 },
  { coins: 125, xp: 80 },
  { coins: 150, xp: 100 },
  { coins: 200, xp: 130 },
  { coins: 500, xp: 250 },
] as const;

function day(value: unknown): string {
  if (typeof value !== 'string' || !value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
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
  const limited = await enforceSharedRateLimit(uid, 'auth.daily-login', { windowMs: 60_000, maxRequests: 5 });
  if (limited) return limited;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    const learningRef = db.collection('learning').doc(uid);
    const result = await db.runTransaction(async (tx) => {
      const [userSnap, learningSnap] = await Promise.all([tx.get(userRef), tx.get(learningRef)]);
      if (!userSnap.exists || userSnap.data()?.banned === true) {
        return { error: 'Account unavailable.', status: 403 } as const;
      }
      const user = userSnap.data()!;
      if (day(user.lastLoginDate) === today) {
        return {
          alreadyClaimed: true,
          streak: Number(user.dailyLoginStreak) || 0,
          day: Number(user.lastRewardDay) || 0,
          xp: Number(user.xp) || 0,
          coins: Number(user.coins) || 0,
        } as const;
      }
      const previousDay = day(user.lastLoginDate);
      const streak = previousDay === yesterday ? (Number(user.dailyLoginStreak) || 0) + 1 : 1;
      const rewardDay = previousDay === yesterday ? (Number(user.lastRewardDay) || 0) % REWARDS.length : 0;
      const reward = REWARDS[rewardDay];
      const nextDay = (rewardDay + 1) % REWARDS.length;
      tx.update(userRef, {
        coins: FieldValue.increment(reward.coins),
        xp: FieldValue.increment(reward.xp),
        dailyLoginStreak: streak,
        lastLoginDate: today,
        lastRewardDay: nextDay,
        lastActive: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(learningRef, {
        coins: FieldValue.increment(reward.coins),
        xp: FieldValue.increment(reward.xp),
        streak,
        lastStreakDate: today,
        lastSynced: FieldValue.serverTimestamp(),
      }, { merge: true });
      return {
        alreadyClaimed: false,
        streak,
        day: nextDay,
        reward,
        xp: (Number(user.xp) || 0) + reward.xp,
        coins: (Number(user.coins) || 0) + reward.coins,
      } as const;
    });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Daily Login] Transaction failed.', error);
    return NextResponse.json({ error: 'Daily reward is temporarily unavailable.' }, { status: 503 });
  }
}
