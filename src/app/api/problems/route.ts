import { NextRequest, NextResponse } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';
import type { Difficulty } from '@/types';

const DIFFICULTIES: Difficulty[] = ['Easy', 'Medium', 'Hard'];
const MAX_PAGE_SIZE = 50;
const MAX_PROGRESS_SCAN_BATCHES = 5;

function matchesFilters(
  data: Record<string, unknown>,
  difficulty: Difficulty | null,
  topic: string | null,
) {
  if (difficulty && data.difficulty !== difficulty) return false;
  if (topic && (!Array.isArray(data.topics) || !data.topics.includes(topic))) return false;
  return true;
}

function matchesProgressStatus(
  progress: Record<string, unknown> | undefined,
  status: string,
) {
  if (status === 'all') return true;
  if (status === 'solved') return progress?.solved === true;
  if (status === 'unsolved') return progress?.solved !== true;
  if (status === 'attempted') return progress?.attempted === true;
  return progress?.bookmarked === true;
}

function toSummary(id: string, data: Record<string, unknown>) {
  if (typeof data.title !== 'string'
    || !DIFFICULTIES.includes(data.difficulty as Difficulty)
    || typeof data.points !== 'number') return null;

  return {
    id,
    title: data.title,
    difficulty: data.difficulty as Difficulty,
    category: typeof data.category === 'string' ? data.category : '',
    points: data.points,
    topics: Array.isArray(data.topics)
      ? data.topics.filter((topic: unknown): topic is string => typeof topic === 'string')
      : [],
    ...(typeof data.estimatedTime === 'number' ? { estimatedTime: data.estimatedTime } : {}),
    ...(typeof data.isPremium === 'boolean' ? { isPremium: data.isPremium } : {}),
  };
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

  const limited = await enforceSharedRateLimit(uid, 'problems.list', {
    windowMs: 60_000,
    maxRequests: 60,
  });
  if (limited) return limited;

  const params = request.nextUrl.searchParams;
  const difficultyValue = params.get('difficulty');
  const difficulty = difficultyValue && DIFFICULTIES.includes(difficultyValue as Difficulty)
    ? difficultyValue as Difficulty
    : null;
  const topicValue = params.get('topic')?.trim() || null;
  const search = params.get('search')?.normalize('NFKC').trim().toLowerCase() || '';
  const cursor = params.get('cursor') || null;
  const sort = params.get('sort') || 'title';
  const status = params.get('status') || 'all';
  const parsedPageSize = Number(params.get('limit') || 25);
  if ((difficultyValue && !difficulty)
    || (topicValue && topicValue.length > 80)
    || search.length > 100
    || (cursor && cursor.length > 128)
    || !Number.isInteger(parsedPageSize)
    || parsedPageSize < 1
    || parsedPageSize > MAX_PAGE_SIZE
    || !['all', 'solved', 'unsolved', 'attempted', 'bookmarked'].includes(status)
    || !['title', 'difficulty', 'points-asc', 'points-desc'].includes(sort)) {
    return NextResponse.json({ error: 'Invalid problem catalog query.' }, { status: 400 });
  }
  if (search && sort !== 'title') {
    return NextResponse.json({ error: 'Title-prefix search supports title sorting only.' }, { status: 400 });
  }

  try {
    const db = getAdminFirestore();
    const userSnap = await db.collection('users').doc(uid).get();
    if (userSnap.data()?.banned === true) {
      return NextResponse.json({ error: 'Account banned' }, { status: 403 });
    }

    if (search.startsWith('id:')) {
      if (cursor) return NextResponse.json({ error: 'ID lookups do not support cursors.' }, { status: 400 });
      const problemId = search.slice(3).trim();
      if (!problemId || problemId.length > 128) {
        return NextResponse.json({ error: 'Invalid problem ID search.' }, { status: 400 });
      }
      const problemDoc = await db.collection('problems').doc(problemId).get();
      const data = problemDoc.data();
      const progressData = status === 'all'
        ? undefined
        : (await db.collection('users').doc(uid).collection('practiceProgress').doc(problemId).get()).data();
      const summary = problemDoc.exists
        && data?.isPublished === true
        && matchesFilters(data, difficulty, topicValue)
        && matchesProgressStatus(progressData, status)
        ? toSummary(problemDoc.id, data)
        : null;
      return NextResponse.json({
        problems: summary ? [summary] : [],
        nextCursor: null,
        hasMore: false,
        pageSize: parsedPageSize,
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    let query = db.collection('problems').where('isPublished', '==', true);
    if (difficulty) query = query.where('difficulty', '==', difficulty);
    if (topicValue) query = query.where('topics', 'array-contains', topicValue);

    const orderField = sort === 'title'
      ? (search ? 'titleLower' : 'title')
      : sort === 'difficulty' ? 'difficulty' : 'points';
    const orderDirection = sort === 'points-desc' ? 'desc' : 'asc';
    if (search) {
      query = query
        .where('titleLower', '>=', search)
        .where('titleLower', '<=', `${search}\uf8ff`);
    }
    query = query.orderBy(orderField, orderDirection).orderBy(FieldPath.documentId(), orderDirection);

    const cursorSnapshot = cursor ? await db.collection('problems').doc(cursor).get() : undefined;
    if (cursorSnapshot
      && (!cursorSnapshot.exists
        || cursorSnapshot.data()?.isPublished !== true
        || (search && typeof cursorSnapshot.data()?.titleLower !== 'string'))) {
        return NextResponse.json({ error: 'Invalid problem page cursor.' }, { status: 400 });
    }

    if (status === 'all') {
      const pageQuery = cursorSnapshot ? query.startAfter(cursorSnapshot) : query;
      const snapshot = await pageQuery.limit(parsedPageSize + 1).get();
      const hasMore = snapshot.docs.length > parsedPageSize;
      const pageDocs = snapshot.docs.slice(0, parsedPageSize);
      const problems = pageDocs.flatMap((problemDoc) => {
        const summary = toSummary(problemDoc.id, problemDoc.data());
        return summary ? [summary] : [];
      });

      return NextResponse.json({
        problems,
        nextCursor: hasMore ? pageDocs[pageDocs.length - 1]?.id ?? null : null,
        hasMore,
        pageSize: parsedPageSize,
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    let scanCursor = cursorSnapshot ?? null;
    let lastScanned = scanCursor;
    let hasMore = false;
    const pageDocs: typeof lastScanned[] = [];
    const progressCollection = db.collection('users').doc(uid).collection('practiceProgress');
    for (let batchIndex = 0; batchIndex < MAX_PROGRESS_SCAN_BATCHES && pageDocs.length < parsedPageSize; batchIndex += 1) {
      let batchQuery = query.limit(parsedPageSize + 1);
      if (scanCursor) batchQuery = batchQuery.startAfter(scanCursor);
      const batch = await batchQuery.get();
      if (batch.docs.length === 0) {
        hasMore = false;
        break;
      }

      const progressSnapshots = await Promise.all(
        batch.docs.map((problemDoc) => progressCollection.doc(problemDoc.id).get()),
      );
      for (let index = 0; index < batch.docs.length; index += 1) {
        const problemDoc = batch.docs[index];
        const progressData = progressSnapshots[index].data();
        const matchesStatus = matchesProgressStatus(progressData, status);
        lastScanned = problemDoc;
        scanCursor = problemDoc;
        if (matchesStatus) pageDocs.push(problemDoc);
        if (pageDocs.length === parsedPageSize) {
          hasMore = index < batch.docs.length - 1 || batch.docs.length === parsedPageSize + 1;
          break;
        }
      }
      if (pageDocs.length === parsedPageSize) break;
      if (batch.docs.length < parsedPageSize + 1) {
        hasMore = false;
        break;
      }
      hasMore = true;
    }

    const problems = pageDocs.flatMap((problemDoc) => {
      if (!problemDoc) return [];
      const data = problemDoc.data();
      const summary = data ? toSummary(problemDoc.id, data) : null;
      return summary ? [summary] : [];
    });

    return NextResponse.json({
      problems,
      nextCursor: hasMore ? lastScanned?.id ?? null : null,
      hasMore,
      pageSize: parsedPageSize,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Problems GET] Failed to list published problems.', error);
    return NextResponse.json({ error: 'Problem catalog is temporarily unavailable.' }, { status: 503 });
  }
}
