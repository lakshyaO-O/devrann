import { NextRequest, NextResponse } from 'next/server';
import { FieldPath } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';
import { toExportValue } from '@/lib/account-export';

const EXPORTABLE_COLLECTIONS = [
  'achievements',
  'activity',
  'aiUsage',
  'arenaSettings',
  'blocked',
  'challenges',
  'challengeClaims',
  'codeShares',
  'combatLogs',
  'contestReminders',
  'codingSessions',
  'drafts',
  'dailyMissions',
  'earnings',
  'friendRequests',
  'friends',
  'gameHistory',
  'github',
  'inventory',
  'loginHistory',
  'matches',
  'missions',
  'mentorProfiles',
  'notifications',
  'practiceProgress',
  'progress',
  'projects',
  'purchaseHistory',
  'recentlyViewed',
  'savedCode',
  'sessions',
  'submissions',
  'studyGroups',
] as const;
const PAGE_SIZE = 200;

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

  const limited = await enforceSharedRateLimit(uid, 'auth.export-data', { windowMs: 60_000, maxRequests: 90 });
  if (limited) return limited;

  try {
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    const collectionName = request.nextUrl.searchParams.get('collection');

    if (!collectionName) {
      const [profile, publicProfile] = await Promise.all([
        userRef.get(),
        db.collection('publicProfiles').doc(uid).get(),
      ]);
      if (!profile.exists) return NextResponse.json({ error: 'Account data not found.' }, { status: 404 });
      return NextResponse.json({
        profile: toExportValue(profile.data()),
        publicProfile: publicProfile.exists ? toExportValue(publicProfile.data()) : null,
        collections: EXPORTABLE_COLLECTIONS,
        exportedAt: new Date().toISOString(),
      }, { headers: { 'Cache-Control': 'private, no-store' } });
    }

    if (!EXPORTABLE_COLLECTIONS.includes(collectionName as typeof EXPORTABLE_COLLECTIONS[number])) {
      return NextResponse.json({ error: 'Unsupported account data collection.' }, { status: 400 });
    }
    const cursor = request.nextUrl.searchParams.get('cursor');
    const collectionRef = collectionName === 'challengeClaims'
      ? userRef.collection('challenges').doc('daily').collection('claims')
      : userRef.collection(collectionName);
    let query = collectionRef.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) {
      const cursorSnapshot = await collectionRef.doc(cursor).get();
      if (!cursorSnapshot.exists) return NextResponse.json({ error: 'Invalid export cursor.' }, { status: 400 });
      query = query.startAfter(cursorSnapshot);
    }
    const snapshot = await query.get();
    return NextResponse.json({
      collection: collectionName,
      records: snapshot.docs.map((entry) => ({
        id: entry.id,
        data: toExportValue(entry.data()),
      })),
      nextCursor: snapshot.size === PAGE_SIZE ? snapshot.docs[snapshot.docs.length - 1].id : null,
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[Account Export GET] Failed to export account data', error);
    return NextResponse.json({ error: 'Unable to export account data.' }, { status: 503 });
  }
}
