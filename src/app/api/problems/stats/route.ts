import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';
import type { Difficulty } from '@/types';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];

function readTopicCounts(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([topic, count]) =>
    typeof count === 'number' && Number.isInteger(count) && count >= 0 && topic.length > 0
      ? [[topic, count] as const]
      : [],
  );
  return Object.fromEntries(entries);
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

  const limited = await enforceSharedRateLimit(uid, 'problems.stats', {
    windowMs: 60_000,
    maxRequests: 30,
  });
  if (limited) return limited;

  try {
    const db = getAdminFirestore();
    const published = db.collection('problems').where('isPublished', '==', true);

    const [totalSnap, ...difficultySnaps] = await Promise.all([
      published.count().get(),
      ...DIFFICULTIES.map((difficulty) => published.where('difficulty', '==', difficulty).count().get()),
    ]);

    const difficulty = Object.fromEntries(
      DIFFICULTIES.map((level, index) => [level, difficultySnaps[index].data().count]),
    );

    let topics: Record<string, number> | null = null;
    try {
      const statsSnap = await db.collection('problemStats').doc('global').get();
      topics = readTopicCounts(statsSnap.data()?.topics);
    } catch {
      topics = null;
    }

    return NextResponse.json({
      total: totalSnap.data().count,
      difficulty,
      topics,
      topicsAvailable: topics !== null,
      generatedAt: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch (error) {
    console.error('[Problems Stats GET] Failed to load catalog stats.', error);
    return NextResponse.json({ error: 'Problem statistics are temporarily unavailable.' }, { status: 503 });
  }
}
