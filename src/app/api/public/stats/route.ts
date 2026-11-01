import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  const rate = checkRateLimit('public-stats', request, { windowMs: 60_000, maxRequests: 30 });
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterMs);

  try {
    const db = getAdminFirestore();
    const [users, battles, battleRows, activeBattles, onlinePlayers] = await Promise.all([
      db.collection('users').count().get(),
      db.collection('battles').count().get(),
      db.collection('battles').where('executionTime', '>', 0).get(),
      db.collection('battles').where('status', '==', 'in-progress').count().get(),
      db.collection('users').where('onlineStatus', '==', 'online').count().get(),
    ]);
    const executionTimes = battleRows.docs
      .map((battle) => battle.data().executionTime)
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0);
    return NextResponse.json({
      totalPlayers: users.data().count,
      totalBattles: battles.data().count,
      avgExecutionTime: executionTimes.length
        ? Math.round(executionTimes.reduce((sum, value) => sum + value, 0) / executionTimes.length)
        : 0,
      activeBattles: activeBattles.data().count,
      onlinePlayers: onlinePlayers.data().count,
    }, { headers: { 'Cache-Control': 'public, max-age=30' } });
  } catch (error) {
    console.error('[PublicStats GET] Failed to load platform counts', error);
    return NextResponse.json({ error: 'Platform statistics are temporarily unavailable.' }, { status: 503 });
  }
}
