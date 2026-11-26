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

    const post = { id: postSnap.id, ...postSnap.data() };

    const commentsSnap = await db.collection('communityPosts').doc(id).collection('comments')
      .orderBy('createdAt', 'asc')
      .get();
    const comments = commentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    return NextResponse.json({ post, comments });
  } catch (err: any) {
    console.error('[Community Post GET] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const limited = await enforceSharedRateLimit(uid, 'community.post.delete', { windowMs: 60_000, maxRequests: 20 });
    if (limited) return limited;

    const db = getAdminFirestore();
    const postRef = db.collection('communityPosts').doc(id);
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const postData = postSnap.data()!;
    if (postData.userId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await postRef.delete();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Community Post DELETE] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const limited = await enforceSharedRateLimit(uid, 'community.post.update', { windowMs: 60_000, maxRequests: 20 });
    if (limited) return limited;

    const db = getAdminFirestore();
    const postRef = db.collection('communityPosts').doc(id);
    const postSnap = await postRef.get();

    if (!postSnap.exists) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const postData = postSnap.data()!;
    if (postData.userId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const allowedFields = ['title', 'content', 'code', 'codeLanguage', 'tags'] as const;
    const updates: Record<string, any> = { updatedAt: FieldValue.serverTimestamp(), isEdited: true };

    for (const field of allowedFields) {
      const value = body[field];
      if (value === undefined) continue;
      if (field === 'tags') {
        if (!Array.isArray(value) || value.length > 10 || value.some((t) => typeof t !== 'string' || t.length > 30)) {
          return NextResponse.json({ error: 'Invalid tags' }, { status: 400 });
        }
        updates[field] = value;
      } else if (typeof value === 'string' && value.length <= 10000) {
        updates[field] = value;
      } else {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 });
      }
    }

    await postRef.update(updates);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Community Post PATCH] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
