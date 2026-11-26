import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
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

  const limited = await enforceSharedRateLimit(uid, 'problems.content', {
    windowMs: 60_000,
    maxRequests: 60,
  });
  if (limited) return limited;

  try {
    const { id } = await params;
    if (!id || id.length > 128) {
      return NextResponse.json({ error: 'Invalid problem identifier.' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const [metaSnap, contentSnap, userSnap] = await Promise.all([
      db.collection('problems').doc(id).get(),
      db.collection('problemContent').doc(id).get(),
      db.collection('users').doc(uid).get(),
    ]);

    if (userSnap.data()?.banned === true) {
      return NextResponse.json({ error: 'Account banned' }, { status: 403 });
    }
    if (!metaSnap.exists || metaSnap.data()?.isPublished !== true || !contentSnap.exists) {
      return NextResponse.json({ error: 'Published problem not found.' }, { status: 404 });
    }

    const meta = metaSnap.data()!;
    if (metaSnap.data()?.isPremium === true) {
      const subscriptionTier = userSnap.data()?.subscriptionTier;
      if (
        !userSnap.exists ||
        (subscriptionTier !== 'pro' && subscriptionTier !== 'elite')
      ) {
        return NextResponse.json({ error: 'Premium access required' }, { status: 403 });
      }
    }

    const content = contentSnap.data()!;
    const starterCode = content.starterCode && typeof content.starterCode === 'object'
      ? Object.fromEntries(
          Object.entries(content.starterCode)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            .slice(0, 7),
        )
      : {};
    const solutionCode = content.solutionCode && typeof content.solutionCode === 'object'
      ? Object.fromEntries(
          Object.entries(content.solutionCode)
            .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
            .slice(0, 7),
        )
      : {};
    const testCases = Array.isArray(content.testCases)
      ? content.testCases.flatMap((testCase: Record<string, unknown>) => {
          if (testCase.isHidden !== false
            || typeof testCase.input !== 'string'
            || typeof testCase.expected !== 'string') return [];
          return [{ input: testCase.input, expected: testCase.expected, isHidden: false }];
        }).slice(0, 3)
      : [];
    const examples = Array.isArray(content.examples)
      ? content.examples.flatMap((example: Record<string, unknown>) => {
          if (typeof example.input !== 'string' || typeof example.output !== 'string') return [];
          return [{
            input: example.input,
            output: example.output,
            ...(typeof example.explanation === 'string' ? { explanation: example.explanation } : {}),
          }];
        }).slice(0, 20)
      : [];
    const sources = Array.isArray(meta.sources)
        ? meta.sources.flatMap((source: Record<string, unknown>) => {
            if (typeof source.provider !== 'string'
              || typeof source.repository !== 'string'
              || typeof source.path !== 'string'
              || typeof source.revision !== 'string'
              || typeof source.attribution !== 'string'
              || typeof source.license !== 'string'
              || typeof source.url !== 'string'
              || typeof source.licenseUrl !== 'string') return [];
            try {
              if (new URL(source.url).protocol !== 'https:' || new URL(source.licenseUrl).protocol !== 'https:') return [];
            } catch {
              return [];
            }
            return [{
              provider: source.provider,
              repository: source.repository,
              path: source.path,
              revision: source.revision,
              url: source.url,
              attribution: source.attribution,
              license: source.license,
              licenseUrl: source.licenseUrl,
            }];
          }).slice(0, 10)
        : [];

    return NextResponse.json({
      problem: {
        id: metaSnap.id,
        title: typeof meta.title === 'string' ? meta.title : '',
        isPublished: true,
        difficulty: meta.difficulty,
        category: meta.category,
        points: meta.points,
        topics: Array.isArray(meta.topics) ? meta.topics : [],
        description: typeof content.description === 'string' ? content.description : '',
        constraints: Array.isArray(content.constraints) ? content.constraints : [],
        examples,
        testCases,
        hints: Array.isArray(content.hints) ? content.hints : [],
        editorial: typeof content.editorial === 'string' ? content.editorial : '',
        starterCode,
        solutionCode,
        timeLimitMs: content.timeLimitMs,
        memoryLimitKb: content.memoryLimitKb,
        sources,
      },
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Problem GET] Failed to load published problem.', error);
    return NextResponse.json({ error: 'Problem is temporarily unavailable.' }, { status: 503 });
  }
}
