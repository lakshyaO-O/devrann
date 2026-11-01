import { NextResponse } from 'next/server';
import { Timestamp } from 'firebase-admin/firestore';
import { getAdminFirestore } from '@/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import type { PublicOverview, PublicProblemPreview } from '@/components/landing/public-overview';

export const dynamic = 'force-dynamic';

function toIsoDate(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === 'number') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export async function GET(request: Request) {
  try {
    const rateLimit = checkRateLimit('public-overview', request, { windowMs: 60_000, maxRequests: 30 });
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterMs);

    const db = getAdminFirestore();
    const [userCount, publishedProblemsCount, problemsSnapshot, leadersSnapshot, contestsSnapshot] =
      await Promise.all([
        db.collection('users').count().get(),
        db.collection('problems').where('isPublished', '==', true).count().get(),
        db.collection('problems')
          .where('isPublished', '==', true)
          .orderBy('title', 'asc')
          .limit(3)
          .get(),
        db.collection('publicProfiles')
          .where('isPublic', '==', true)
          .where('privacySettings.showRating', '==', true)
          .limit(50)
          .get(),
        db.collection('contests')
          .where('isPublic', '==', true)
          .orderBy('date', 'asc')
          .limit(20)
          .get(),
      ]);

    const problems = await Promise.all(problemsSnapshot.docs.map(async (problemDoc) => {
      const contentSnapshot = await db.collection('problemContent').doc(problemDoc.id).get();
      const meta = problemDoc.data();
      const content = contentSnapshot.exists ? contentSnapshot.data()! : {};
      const rawExamples = Array.isArray(content.examples) ? content.examples : [];
      const rawStarterCode = content.starterCode && typeof content.starterCode === 'object'
        ? content.starterCode as Record<string, unknown>
        : {};

      const preview: PublicProblemPreview = {
        id: problemDoc.id,
        title: asString(meta.title),
        difficulty: asString(meta.difficulty),
        category: asString(meta.category),
        description: asString(content.description),
        examples: rawExamples.slice(0, 2).flatMap((example: unknown) => {
          if (!example || typeof example !== 'object') return [];
          const item = example as Record<string, unknown>;
          if (typeof item.input !== 'string' || typeof item.output !== 'string') return [];
          return [{
            input: item.input.slice(0, 500),
            output: item.output.slice(0, 500),
            ...(typeof item.explanation === 'string' ? { explanation: item.explanation.slice(0, 500) } : {}),
          }];
        }),
        starterCode: Object.fromEntries(
          Object.entries(rawStarterCode)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            .slice(0, 4)
            .map(([language, code]) => [language, code.slice(0, 4000)]),
        ),
      };

      return preview;
    }));

    const leaderboardCandidates = await Promise.all(leadersSnapshot.docs.map(async (profileDoc) => {
      const userDoc = await db.collection('users').doc(profileDoc.id).get();
      if (!userDoc.exists) return null;
      const profile = userDoc.data()!;
      if (profile.banned === true || typeof profile.username !== 'string'
        || typeof profile.rating !== 'number' || typeof profile.wins !== 'number' || profile.wins < 1) {
        return null;
      }
      return {
        id: profileDoc.id,
        username: profile.username,
        rating: profile.rating,
        wins: profile.wins,
      };
    }));
    const leaderboard = leaderboardCandidates
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => b.rating - a.rating || b.wins - a.wins)
      .slice(0, 3);

    const now = Date.now();
    const contests = contestsSnapshot.docs.flatMap((contestDoc) => {
      const contest = contestDoc.data();
      const date = toIsoDate(contest.date);
      if (contest.isPublic !== true) return [];
      if (!date || new Date(date).getTime() < now || typeof contest.title !== 'string') return [];
      if (contest.status === 'ended' || contest.status === 'cancelled') return [];
      return [{
        id: contestDoc.id,
        title: contest.title,
        date,
        status: asString(contest.status) || 'scheduled',
      }];
    }).slice(0, 3);

    const overview: PublicOverview = {
      registeredUsers: userCount.data().count,
      publishedProblems: publishedProblemsCount.data().count,
      problems,
      leaderboard,
      contests,
    };

    return NextResponse.json(overview, {
      headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('[PublicOverview GET] Failed to load public platform data', error);
    return NextResponse.json(
      { error: 'Live platform data is temporarily unavailable.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
