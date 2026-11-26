import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { checkRateLimit, enforceSharedRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rateCheck = checkRateLimit('anonymous', request, { windowMs: 60_000, maxRequests: 120 });
    if (!rateCheck.allowed) return rateLimitResponse(rateCheck.retryAfterMs);

    const { id } = await params;
    const db = getAdminFirestore();
    const postRef = db.collection('communityPosts').doc(id);
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const snap = await db.collection('communityPosts').doc(id).collection('comments')
      .orderBy('createdAt', 'asc')
      .get();
    const comments = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ comments });
  } catch (err: any) {
    console.error('[Comments GET] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    const limited = await enforceSharedRateLimit(uid, 'community.comment.create', { windowMs: 60_000, maxRequests: 30 });
    if (limited) return limited;

    const { content, parentId } = await request.json();

    if (typeof content !== 'string' || !content.trim() || content.length > 5000) {
      return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
    }
    if (parentId !== undefined && parentId !== null && typeof parentId !== 'string') {
      return NextResponse.json({ error: 'Invalid parentId' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const postRef = db.collection('communityPosts').doc(id);
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data();

    const commentRef = await db.collection('communityPosts').doc(id).collection('comments').add({
      postId: id,
      userId: uid,
      username: userData?.username || 'Anonymous',
      photoURL: userData?.photoURL || '',
      content,
      parentId: parentId || null,
      likes: 0,
      createdAt: FieldValue.serverTimestamp(),
    });

    await postRef.update({ comments: FieldValue.increment(1) });

    return NextResponse.json({ id: commentRef.id, success: true }, { status: 201 });
  } catch (err: any) {
    console.error('[Comments POST] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
