import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  const rate = checkRateLimit('public-leaderboard', request, { windowMs: 60_000, maxRequests: 30 });
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterMs);

  try {
    const db = getAdminFirestore();
    const publicProfiles = await db.collection('publicProfiles')
      .where('isPublic', '==', true)
      .where('privacySettings.showRating', '==', true)
      .limit(200)
      .get();
    const leaders = (await Promise.all(publicProfiles.docs.map(async (entry) => {
      const profile = entry.data();
      const userSnap = await db.collection('users').doc(entry.id).get();
      if (!userSnap.exists) return null;
      const user = userSnap.data()!;
      if (user.banned === true || typeof user.rating !== 'number'
        || typeof user.username !== 'string' || typeof user.wins !== 'number' || user.wins < 1) return null;
      return {
        id: entry.id,
        uid: entry.id,
        username: user.username,
        rating: user.rating,
        wins: user.wins,
        losses: typeof user.losses === 'number' ? user.losses : 0,
        photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : '',
      };
    }))).filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => b.rating - a.rating || b.wins - a.wins)
      .slice(0, 50);

    return NextResponse.json({ leaders }, { headers: { 'Cache-Control': 'public, max-age=30' } });
  } catch (error) {
    console.error('[PublicLeaderboard GET] Failed to load leaderboard', error);
    return NextResponse.json({ error: 'Leaderboard is temporarily unavailable.' }, { status: 503 });
  }
}
