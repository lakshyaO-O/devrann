import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import type { AdminRole } from '@/types/admin';
import { hasPermission } from '@/types/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getIsoWeekRange } from '@/lib/challenges';

const MAX_CHALLENGE_PROBLEMS = 10;

function isUtcDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function publishedProblemIds(db: FirebaseFirestore.Firestore, ids: string[]): Promise<boolean> {
  const snapshots = await Promise.all(ids.map((id) => db.collection('problems').doc(id).get()));
  return snapshots.every((snapshot) =>
    snapshot.exists
    && snapshot.data()?.isPublished === true
    && snapshot.data()?.isPremium !== true,
  );
}

async function verifyAndGetRole(request: NextRequest): Promise<{ uid: string; role: AdminRole } | NextResponse> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) as NextResponse;
  }
  try {
    const decodedToken = await getAdminAuth().verifyIdToken(authHeader.slice(7));
    const db = getAdminFirestore();
    const userSnap = await db.collection('users').doc(decodedToken.uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 }) as NextResponse;
    }
    const userData = userSnap.data()!;
    const role: AdminRole = userData.role || (userData.isAdmin ? 'admin' : 'user');
    return { uid: decodedToken.uid, role };
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 }) as NextResponse;
  }
}

function isErrorResponse(result: any): result is NextResponse {
  return result instanceof NextResponse;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAndGetRole(request);
    if (isErrorResponse(auth)) return auth;

    const rateCheck = checkRateLimit(auth.uid, request);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs);

    if (!hasPermission(auth.role, 'challenges.read')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const [dailySnap, weeklySnap] = await Promise.all([
      db.collection('challenges').doc('daily').get(),
      db.collection('challenges').doc('weekly').get(),
    ]);

    return NextResponse.json({
      daily: dailySnap.exists ? dailySnap.data() : null,
      weekly: weeklySnap.exists ? weeklySnap.data() : null,
    });
  } catch (err: any) {
    console.error('[Admin Challenges GET] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAndGetRole(request);
    if (isErrorResponse(auth)) return auth;

    const rateCheck = checkRateLimit(auth.uid, request);
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs);

    if (!hasPermission(auth.role, 'challenges.write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const db = getAdminFirestore();
    const body = await request.json();
    const { action, data } = body;

    if (action === 'setDaily') {
      if (!isUtcDate(data?.date)
        || typeof data?.problemId !== 'string'
        || !data.problemId.trim()
        || data.problemId.length > 128
        || !Number.isInteger(data?.xpBonus)
        || data.xpBonus < 0
        || data.xpBonus > 1000) {
        return NextResponse.json({ error: 'Daily challenge requires a UTC date, published problem ID, and XP bonus from 0 to 1000.' }, { status: 400 });
      }
      if (!(await publishedProblemIds(db, [data.problemId]))) {
        return NextResponse.json({ error: 'Daily challenge problem must be published and available to all users.' }, { status: 400 });
      }
      const snap = await db.collection('challenges').doc('daily').get();
      const challenges = snap.exists ? (snap.data()?.challenges || []) : [];
      const start = new Date(`${data.date}T00:00:00.000Z`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const challenge = {
        date: data.date,
        problemId: data.problemId,
        xpBonus: data.xpBonus,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
        timeZone: 'UTC',
      };
      const idx = challenges.findIndex((item: any) => item.date === data.date);
      if (idx >= 0) challenges[idx] = challenge;
      else challenges.push(challenge);
      await db.collection('challenges').doc('daily').set({ challenges }, { merge: true });
    } else if (action === 'setWeekly') {
      const range = getIsoWeekRange(data?.week);
      const problemIds = data?.problemIds;
      if (!range
        || !Array.isArray(problemIds)
        || problemIds.length < 1
        || problemIds.length > MAX_CHALLENGE_PROBLEMS
        || problemIds.some((id: unknown) => typeof id !== 'string' || !id.trim() || id.length > 128)
        || new Set(problemIds).size !== problemIds.length
        || !Number.isInteger(data?.xpBonus)
        || data.xpBonus < 0
        || data.xpBonus > 5000) {
        return NextResponse.json({ error: 'Weekly challenge requires a valid ISO week, 1–10 unique problem IDs, and an XP bonus from 0 to 5000.' }, { status: 400 });
      }
      if (!(await publishedProblemIds(db, problemIds))) {
        return NextResponse.json({ error: 'Every weekly challenge problem must be published and available to all users.' }, { status: 400 });
      }
      await db.collection('challenges').doc('weekly').set({
        week: data.week,
        problemIds,
        xpBonus: data.xpBonus,
        ...range,
        timeZone: 'UTC',
      }, { merge: true });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Admin Challenges POST] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
