import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    let uid: string;
    try {
      ({ uid } = await getAdminAuth().verifyIdToken(authHeader.slice(7)));
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
    const limited = await enforceSharedRateLimit(uid, 'groups.search', { windowMs: 60_000, maxRequests: 30 });
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const topic = searchParams.get('topic');
    const isPublic = searchParams.get('isPublic');

    const db = getAdminFirestore();
    let query: FirebaseFirestore.Query = db.collection('studyGroups').orderBy('memberCount', 'desc').limit(20);

    if (topic) {
      query = query.where('topic', '==', topic);
    }
    if (isPublic !== null) {
      query = query.where('isPublic', '==', isPublic === 'true');
    }

    const snap = await query.get();
    const groups = snap.docs
      .filter((d) => d.data().isPublic === true || d.data().memberIds?.includes(uid))
      .filter((d) => {
        const search = new URL(request.url).searchParams.get('search')?.toLowerCase().trim();
        if (!search) return true;
        const data = d.data();
        return [data.name, data.description, ...(Array.isArray(data.tags) ? data.tags : [])]
          .some((value) => typeof value === 'string' && value.toLowerCase().includes(search));
      })
      .map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ groups });
  } catch (err: any) {
    console.error('[Study Groups GET] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let decodedToken;
    try {
      decodedToken = await getAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const rateLimit = await enforceSharedRateLimit(uid, 'groups.create', { windowMs: 60_000, maxRequests: 5 });
    if (rateLimit) return rateLimit;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid group data.' }, { status: 400 });
    }
    const { name, description, topic, maxMembers, isPublic, tags, schedule, resources } = body;

    if (typeof name !== 'string' || name.trim().length < 2 || name.length > 80
      || typeof description !== 'string' || description.length > 1000
      || typeof topic !== 'string' || topic.length < 1 || topic.length > 80
      || (maxMembers !== undefined && (!Number.isInteger(maxMembers) || maxMembers < 2 || maxMembers > 100))
      || (isPublic !== undefined && typeof isPublic !== 'boolean')
      || (tags !== undefined && (!Array.isArray(tags) || tags.length > 10
        || tags.some((tag: unknown) => typeof tag !== 'string' || tag.length > 40)))
    ) {
      return NextResponse.json({ error: 'Missing required fields: name, description, topic' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data();

    const ref = await db.collection('studyGroups').add({
      name: name.trim(),
      description: description.trim(),
      topic: topic.trim(),
      createdBy: uid,
      adminIds: [uid],
      memberIds: [uid],
      memberCount: 1,
      maxMembers: maxMembers || 20,
      isPublic: isPublic !== undefined ? isPublic : true,
      tags: tags || [],
      schedule: typeof schedule === 'string' ? schedule.slice(0, 200) : '',
      resources: Array.isArray(resources) ? resources.slice(0, 20) : [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id, success: true }, { status: 201 });
  } catch (err: any) {
    console.error('[Study Groups POST] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
