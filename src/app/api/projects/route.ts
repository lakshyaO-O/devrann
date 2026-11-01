import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

const PROJECT_LIST_LIMIT = 24;
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_LIST_LENGTH = 12;

async function getIdentity(request: NextRequest) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  try {
    return await getAdminAuth().verifyIdToken(authorization.slice(7));
  } catch {
    return null;
  }
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= MAX_LIST_LENGTH
    && value.every((item) => typeof item === 'string' && item.length <= 100);
}

function isSafeUrl(value: unknown) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function serializeProject(id: string, data: FirebaseFirestore.DocumentData) {
  const createdAt = data.createdAt instanceof Timestamp
    ? data.createdAt.toDate().toISOString()
    : typeof data.createdAt === 'string' ? data.createdAt : null;

  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    technologies: isStringList(data.technologies) ? data.technologies : [],
    screenshots: isStringList(data.screenshots) ? data.screenshots : [],
    liveUrl: isSafeUrl(data.liveUrl) ? data.liveUrl || null : null,
    githubUrl: isSafeUrl(data.githubUrl) ? data.githubUrl || null : null,
    tags: isStringList(data.tags) ? data.tags : [],
    userId: typeof data.userId === 'string' ? data.userId : '',
    username: typeof data.username === 'string' ? data.username : 'Community member',
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
    likes: Number.isSafeInteger(data.likes) && data.likes >= 0 ? data.likes : 0,
    views: Number.isSafeInteger(data.views) && data.views >= 0 ? data.views : 0,
    createdAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('id');
    const userId = searchParams.get('userId');
    const identity = userId ? await getIdentity(request) : null;
    if (userId && (!identity || identity.uid !== userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = getAdminFirestore();
    if (projectId) {
      const snapshot = await db.collection('projects').doc(projectId).get();
      if (!snapshot.exists) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      return NextResponse.json({ project: serializeProject(snapshot.id, snapshot.data()!) });
    }

    let query: FirebaseFirestore.Query = db.collection('projects');
    if (userId) {
      query = query.where('userId', '==', userId).orderBy('createdAt', 'desc');
    } else {
      query = query.orderBy('createdAt', 'desc');
    }

    const snapshot = await query.limit(PROJECT_LIST_LIMIT).get();
    const projects = snapshot.docs.map((document) => serializeProject(document.id, document.data()));
    return NextResponse.json({ projects });
  } catch (error) {
    console.error('[Projects GET] Failed to load projects', error);
    return NextResponse.json({ error: 'Unable to load projects.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getIdentity(request);
    if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rateLimit = checkRateLimit(identity.uid, request);
    if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterMs);

    const body = await request.json().catch(() => null);
    if (!body || typeof body.title !== 'string' || typeof body.description !== 'string') {
      return NextResponse.json({ error: 'Title and description are required.' }, { status: 400 });
    }
    const title = body.title.trim();
    const description = body.description.trim();
    if (!title || title.length > MAX_TITLE_LENGTH || !description || description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json({ error: 'Project title or description is invalid.' }, { status: 400 });
    }
    if (!isStringList(body.technologies ?? []) || !isStringList(body.screenshots ?? []) || !isStringList(body.tags ?? [])) {
      return NextResponse.json({ error: 'Technologies, screenshots, and tags must be short lists of strings.' }, { status: 400 });
    }
    if (!isSafeUrl(body.liveUrl) || !isSafeUrl(body.githubUrl)
      || (body.screenshots ?? []).some((url: string) => !isSafeUrl(url))) {
      return NextResponse.json({ error: 'Project links must use valid HTTP or HTTPS URLs.' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const userSnapshot = await db.collection('users').doc(identity.uid).get();
    if (!userSnapshot.exists) return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    const profile = userSnapshot.data()!;
    const project = {
      userId: identity.uid,
      username: typeof profile.username === 'string' ? profile.username : 'Community member',
      photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : '',
      title,
      description,
      technologies: body.technologies ?? [],
      screenshots: body.screenshots ?? [],
      liveUrl: body.liveUrl || null,
      githubUrl: body.githubUrl || null,
      tags: body.tags ?? [],
      likes: 0,
      views: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    const reference = await db.collection('projects').add(project);

    return NextResponse.json({
      success: true,
      project: serializeProject(reference.id, {
        ...project,
        createdAt: new Date(),
      }),
    }, { status: 201 });
  } catch (error) {
    console.error('[Projects POST] Failed to create project', error);
    return NextResponse.json({ error: 'Unable to create project.' }, { status: 500 });
  }
}
