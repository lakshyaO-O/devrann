import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';

const privacyKeys = [
  'showRating', 'showStats', 'showActivity', 'showAchievements', 'showFriends',
  'showSocialLinks', 'showMatchHistory', 'showTopicMastery', 'showBadges',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function makeProjection(uid: string, user: FirebaseFirestore.DocumentData, privacy: Record<string, boolean>, isPublic: boolean) {
  return {
    uid,
    isPublic,
    username: typeof user.username === 'string' ? user.username : '',
    photoURL: typeof user.photoURL === 'string' ? user.photoURL : '',
    bio: typeof user.bio === 'string' ? user.bio : '',
    interests: Array.isArray(user.interests) ? user.interests.slice(0, 20) : [],
    ...(privacy.showSocialLinks ? {
      ...Object.fromEntries(['githubUrl', 'linkedinUrl', 'twitterUrl', 'websiteUrl', 'title']
        .flatMap((key) => typeof user[key] === 'string' ? [[key, user[key]]] : [])),
    } : {}),
    privacySettings: privacy,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

export async function POST(request: NextRequest) {
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

  const limited = await enforceSharedRateLimit(uid, 'auth.profile-privacy', { windowMs: 60_000, maxRequests: 20 });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) return NextResponse.json({ error: 'Invalid privacy settings.' }, { status: 400 });
  if (body.isProfilePublic !== undefined && typeof body.isProfilePublic !== 'boolean') {
    return NextResponse.json({ error: 'isProfilePublic must be a boolean.' }, { status: 400 });
  }
  if (body.bio !== undefined && (typeof body.bio !== 'string' || body.bio.length > 280)) {
    return NextResponse.json({ error: 'Bio must be text with at most 280 characters.' }, { status: 400 });
  }
  if (body.interests !== undefined
    && (!Array.isArray(body.interests) || body.interests.length > 20
      || body.interests.some((value: unknown) =>
        typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 40,
      ))) {
    return NextResponse.json({ error: 'Provide up to 20 interests, each 1–40 characters.' }, { status: 400 });
  }
  if (body.privacySettings !== undefined) {
    if (!isRecord(body.privacySettings)
      || Object.entries(body.privacySettings).some(([key, value]) =>
        !privacyKeys.includes(key as typeof privacyKeys[number]) || typeof value !== 'boolean',
      )) {
      return NextResponse.json({ error: 'Invalid profile privacy options.' }, { status: 400 });
    }
  }

  try {
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    const publicRef = db.collection('publicProfiles').doc(uid);
    await db.runTransaction(async (tx) => {
      const [userSnap, publicSnap] = await Promise.all([tx.get(userRef), tx.get(publicRef)]);
      if (!userSnap.exists) throw new Error('User profile not found.');
      const user = userSnap.data()!;
      const current = isRecord(user.privacySettings) ? user.privacySettings : {};
      const changed = isRecord(body.privacySettings) ? body.privacySettings : {};
      const privacy = Object.fromEntries(privacyKeys.map((key) => [
        key,
        typeof changed[key] === 'boolean' ? changed[key] : current[key] === true,
      ])) as Record<string, boolean>;
      const isPublic = typeof body.isProfilePublic === 'boolean'
        ? body.isProfilePublic
        : user.isProfilePublic === true || user.profileVisibility === 'public';
      const profileChanges = {
        ...(typeof body.bio === 'string' ? { bio: body.bio.trim() } : {}),
        ...(Array.isArray(body.interests)
          ? { interests: [...new Set(body.interests.map((value: string) => value.trim()))] }
          : {}),
      };
      if (!publicSnap.exists) {
        tx.create(publicRef, makeProjection(uid, { ...user, ...profileChanges }, privacy, isPublic));
      } else {
        tx.set(publicRef, makeProjection(uid, { ...user, ...profileChanges }, privacy, isPublic));
      }
      tx.update(userRef, {
        privacySettings: privacy,
        isProfilePublic: isPublic,
        profileVisibility: isPublic ? 'public' : 'private',
        ...profileChanges,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update profile privacy.';
    if (message === 'User profile not found.') return NextResponse.json({ error: message }, { status: 404 });
    console.error('[Profile Privacy POST] Failed to update profile privacy', error);
    return NextResponse.json({ error: 'Unable to update profile privacy.' }, { status: 500 });
  }
}
