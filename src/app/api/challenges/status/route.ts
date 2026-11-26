import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';
import { hasAcceptedSubmissionForProblemOnDay } from '@/lib/daily-missions';
import {
  countSolvedFromAccepted,
  getDailyWindow,
  getWeeklyWindow,
  isDailyChallenge,
  isWeeklyActive,
  isWeeklyChallenge,
  selectDailyChallenge,
} from '@/lib/challenges';

interface SubmissionRow {
  problemId?: unknown;
  verdict?: unknown;
  submittedAt?: Date;
}

async function acceptedProblemIdsInWindow(
  db: FirebaseFirestore.Firestore,
  uid: string,
  start: Date,
  end: Date,
): Promise<string[]> {
  const snapshot = await db.collection('users').doc(uid).collection('submissions')
    .where('submittedAt', '>=', Timestamp.fromDate(start))
    .where('submittedAt', '<', Timestamp.fromDate(end))
    .get();
  return snapshot.docs.flatMap((doc) => {
    const data = doc.data();
    return data.verdict === 'Accepted' && typeof data.problemId === 'string'
      ? [data.problemId]
      : [];
  });
}

async function publishedSummaries(
  db: FirebaseFirestore.Firestore,
  ids: string[],
) {
  const snapshots = await Promise.all(ids.map((id) => db.collection('problems').doc(id).get()));
  return snapshots.flatMap((snapshot) => {
    const data = snapshot.data();
    if (!snapshot.exists || data?.isPublished !== true) return [];
    return [{
      id: snapshot.id,
      title: typeof data.title === 'string' ? data.title : '',
      difficulty: typeof data.difficulty === 'string' ? data.difficulty : null,
    }];
  });
}

export async function GET(request: NextRequest) {
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

  const limited = await enforceSharedRateLimit(uid, 'challenges.status', {
    windowMs: 60_000,
    maxRequests: 60,
  });
  if (limited) return limited;

  const now = new Date();
  try {
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);

    const [dailyDoc, weeklyDoc, dailyProgressSnap, weeklyProgressSnap] = await Promise.all([
      db.collection('challenges').doc('daily').get(),
      db.collection('challenges').doc('weekly').get(),
      userRef.collection('challenges').doc('daily').get(),
      userRef.collection('challenges').doc('weekly').get(),
    ]);

    const dailyConfig = selectDailyChallenge(dailyDoc.data()?.challenges, now);
    const weeklyData = weeklyDoc.data();
    const weeklyConfig = isWeeklyChallenge(weeklyData) && isWeeklyActive(weeklyData, now)
      ? weeklyData
      : null;

    const dailyWindow = dailyConfig ? getDailyWindow(dailyConfig) : null;
    const weeklyWindow = weeklyConfig ? getWeeklyWindow(weeklyConfig) : null;

    if (!dailyConfig && !weeklyConfig) {
      return NextResponse.json({
        daily: null,
        weekly: null,
        serverTime: now.toISOString(),
        timeZone: 'UTC',
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    const [dailySubmissions, weeklyAccepted, dailyProblem, weeklyProblems] = await Promise.all([
      dailyConfig && dailyWindow
        ? db.collection('users').doc(uid).collection('submissions')
          .where('submittedAt', '>=', Timestamp.fromDate(dailyWindow.start))
          .where('submittedAt', '<', Timestamp.fromDate(dailyWindow.end))
          .get()
        : null,
      weeklyConfig && weeklyWindow
        ? acceptedProblemIdsInWindow(db, uid, weeklyWindow.start, weeklyWindow.end)
        : Promise.resolve([] as string[]),
      dailyConfig ? publishedSummaries(db, [dailyConfig.problemId]) : Promise.resolve([]),
      weeklyConfig ? publishedSummaries(db, weeklyConfig.problemIds) : Promise.resolve([]),
    ]);

    const dailyRows: SubmissionRow[] = dailySubmissions
      ? dailySubmissions.docs.map((doc) => {
        const data = doc.data();
        return {
          problemId: data.problemId,
          verdict: data.verdict,
          submittedAt: data.submittedAt?.toDate?.(),
        };
      })
      : [];

    const dailyCompleted = dailyConfig && dailyWindow
      ? hasAcceptedSubmissionForProblemOnDay(
        dailyRows,
        dailyConfig.problemId,
        dailyWindow.start,
        dailyWindow.end,
      )
      : false;

    const weeklySolved = weeklyConfig
      ? countSolvedFromAccepted(new Set(weeklyAccepted), weeklyConfig.problemIds)
      : [];

    const dailyClaimed = dailyConfig
      ? dailyProgressSnap.exists
        && dailyProgressSnap.data()?.date === dailyConfig.date
        && dailyProgressSnap.data()?.claimed === true
      : false;
    const weeklyClaimed = weeklyConfig
      ? weeklyProgressSnap.exists
        && weeklyProgressSnap.data()?.week === weeklyConfig.week
        && weeklyProgressSnap.data()?.claimed === true
      : false;

    return NextResponse.json({
      daily: dailyConfig && dailyWindow
        ? {
          date: dailyConfig.date,
          problemId: dailyConfig.problemId,
          xpBonus: dailyConfig.xpBonus,
          startAt: dailyWindow.start.toISOString(),
          endAt: dailyWindow.end.toISOString(),
          completed: dailyCompleted,
          claimed: dailyClaimed,
          problem: dailyProblem[0] ?? null,
        }
        : null,
      weekly: weeklyConfig && weeklyWindow
        ? {
          week: weeklyConfig.week,
          problemIds: weeklyConfig.problemIds,
          xpBonus: weeklyConfig.xpBonus,
          startAt: weeklyWindow.start.toISOString(),
          endAt: weeklyWindow.end.toISOString(),
          solvedProblemIds: weeklySolved,
          completed: weeklySolved.length === weeklyConfig.problemIds.length,
          claimed: weeklyClaimed,
          problems: weeklyProblems,
        }
        : null,
      serverTime: now.toISOString(),
      timeZone: 'UTC',
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Challenges Status GET] Failed to load challenge status.', error);
    return NextResponse.json({ error: 'Challenges are temporarily unavailable.' }, { status: 503 });
  }
}
