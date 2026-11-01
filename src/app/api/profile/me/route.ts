import { NextRequest, NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const ACTIVITY_DAYS = 365;
const MAX_ACTIVITY_SUBMISSIONS = 2000;
const MAX_PROBLEMS_PER_LOOKUP = 500;

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value
    && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  return null;
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

  const rate = checkRateLimit(uid, request, { windowMs: 60_000, maxRequests: 30 });
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterMs);

  try {
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    const [userSnap, progressCount, solvedProgress, submissionsCount, recentSubmissions, recentActivity, matches] =
      await Promise.all([
        userRef.get(),
        userRef.collection('practiceProgress').count().get(),
        userRef.collection('practiceProgress').where('solved', '==', true).get(),
        userRef.collection('submissions').count().get(),
        userRef.collection('submissions').orderBy('submittedAt', 'desc').limit(15).get(),
        userRef.collection('submissions')
          .where('submittedAt', '>=', Timestamp.fromDate(new Date(Date.now() - ACTIVITY_DAYS * 86_400_000)))
          .orderBy('submittedAt', 'asc')
          .limit(MAX_ACTIVITY_SUBMISSIONS + 1)
          .get(),
        userRef.collection('matches').orderBy('timestamp', 'desc').limit(100).get(),
      ]);

    if (!userSnap.exists) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    const user = userSnap.data()!;
    const problemIds = solvedProgress.docs
      .filter((entry) => entry.data().solved === true)
      .map((entry) => entry.id);
    const problemData = new Map<string, FirebaseFirestore.DocumentData>();
    for (let offset = 0; offset < problemIds.length; offset += MAX_PROBLEMS_PER_LOOKUP) {
      const refs = problemIds
        .slice(offset, offset + MAX_PROBLEMS_PER_LOOKUP)
        .map((problemId) => db.collection('problems').doc(problemId));
      const snapshots = await db.getAll(...refs);
      snapshots.forEach((snapshot) => {
        if (snapshot.exists) problemData.set(snapshot.id, snapshot.data()!);
      });
    }

    const difficultyCounts = { Easy: 0, Medium: 0, Hard: 0 };
    const topicCounts: Record<string, { solved: number }> = {};
    for (const problemId of problemIds) {
      const problem = problemData.get(problemId);
      if (!problem) continue;
      if (problem.difficulty === 'Easy') difficultyCounts.Easy += 1;
      else if (problem.difficulty === 'Medium') difficultyCounts.Medium += 1;
      else if (problem.difficulty === 'Hard') difficultyCounts.Hard += 1;
      const topics = Array.isArray(problem.topics)
        ? problem.topics.filter((topic: unknown): topic is string => typeof topic === 'string')
        : typeof problem.category === 'string' ? [problem.category] : [];
      for (const topic of topics) {
        topicCounts[topic] ||= { solved: 0 };
        topicCounts[topic].solved += 1;
      }
    }

    const activityByDate: Record<string, number> = {};
    recentActivity.docs.slice(0, MAX_ACTIVITY_SUBMISSIONS).forEach((submission) => {
      const date = toIso(submission.data().submittedAt)?.slice(0, 10);
      if (date) activityByDate[date] = (activityByDate[date] || 0) + 1;
    });

    const rating = typeof user.rating === 'number' ? user.rating : null;
    let ratingBeforeMatches = rating;
    const ratingHistory = matches.docs
      .filter((match) => match.data().rated === true && typeof match.data().eloChange === 'number')
      .map((match) => {
        const data = match.data();
        const entry = {
          matchId: typeof data.battleId === 'string' ? data.battleId : match.id,
          timestamp: toIso(data.timestamp),
          rating: ratingBeforeMatches,
          change: data.eloChange as number,
        };
        if (ratingBeforeMatches !== null) ratingBeforeMatches -= data.eloChange as number;
        return entry;
      })
      .reverse();

    return NextResponse.json({
      profile: {
        username: typeof user.username === 'string' ? user.username : '',
        photoURL: typeof user.photoURL === 'string' ? user.photoURL : '',
        bio: typeof user.bio === 'string' ? user.bio : '',
        interests: Array.isArray(user.interests) ? user.interests : [],
        createdAt: toIso(user.createdAt),
        isProfilePublic: user.isProfilePublic === true || user.profileVisibility === 'public',
        rating,
        highestRating: typeof user.highestRating === 'number' ? user.highestRating : null,
        wins: typeof user.wins === 'number' ? user.wins : 0,
        losses: typeof user.losses === 'number' ? user.losses : 0,
        draws: typeof user.draws === 'number' ? user.draws : 0,
      },
      practice: {
        solved: problemIds.length,
        attempted: progressCount.data().count,
        submissions: submissionsCount.data().count,
        difficulty: difficultyCounts,
        topics: topicCounts,
      },
      recentSubmissions: recentSubmissions.docs.map((entry) => {
        const data = entry.data();
        return {
          id: entry.id,
          problemId: typeof data.problemId === 'string' ? data.problemId : '',
          verdict: typeof data.verdict === 'string' ? data.verdict : 'Unknown',
          language: typeof data.language === 'string' ? data.language : '',
          submittedAt: toIso(data.submittedAt),
          ...(typeof data.executionTimeMs === 'number' ? { executionTimeMs: data.executionTimeMs } : {}),
          ...(typeof data.memoryUsedKb === 'number' ? { memoryUsedKb: data.memoryUsedKb } : {}),
        };
      }),
      activity: activityByDate,
      activityTruncated: recentActivity.size > MAX_ACTIVITY_SUBMISSIONS,
      ratingHistory,
      matchHistory: matches.docs.slice(0, 20).map((entry) => {
        const data = entry.data();
        return {
          id: typeof data.battleId === 'string' ? data.battleId : entry.id,
          opponent: typeof data.opponentName === 'string' ? data.opponentName : 'Player',
          result: typeof data.result === 'string' ? data.result : 'Unknown',
          ratingChange: typeof data.eloChange === 'number' ? data.eloChange : null,
          timestamp: toIso(data.timestamp),
          problemTitle: typeof data.problem?.title === 'string' ? data.problem.title : 'Match',
        };
      }),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Profile Me GET] Failed to load account activity', error);
    return NextResponse.json({ error: 'Profile activity is temporarily unavailable.' }, { status: 503 });
  }
}
