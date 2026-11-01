import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { normalizeUsername, validateUsername } from '@/lib/username';

const USERNAME_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: NextRequest) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let identity;
  try {
    identity = await getAdminAuth().verifyIdToken(authorization.slice(7));
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const rateLimit = checkRateLimit(identity.uid, request);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit.retryAfterMs);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.username !== 'string') {
    return NextResponse.json({ error: 'A username is required.' }, { status: 400 });
  }

  const username = normalizeUsername(body.username.trim());
  const validationError = validateUsername(username);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  try {
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(identity.uid);
    const usernameRef = db.collection('usernames').doc(username);

    const result = await db.runTransaction(async (transaction) => {
      const [profileSnap, usernameSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(usernameRef),
      ]);
      if (!profileSnap.exists) return { status: 'not-found' as const };

      const profile = profileSnap.data()!;
      const previousUsername = typeof profile.username === 'string'
        ? profile.username.toLowerCase()
        : '';
      if (previousUsername === username) return { status: 'unchanged' as const };
      if (usernameSnap.exists && usernameSnap.data()?.userId !== identity.uid) {
        return { status: 'taken' as const };
      }

      const lastChanged = profile.lastUsernameChange;
      const lastChangedAt = lastChanged instanceof Timestamp
        ? lastChanged.toMillis()
        : typeof lastChanged === 'string' ? Date.parse(lastChanged) : NaN;
      const remainingCooldown = lastChangedAt + USERNAME_COOLDOWN_MS - Date.now();
      if (Number.isFinite(lastChangedAt) && remainingCooldown > 0) {
        return { status: 'cooldown' as const, remainingMs: remainingCooldown };
      }

      const previousUsernameRef = previousUsername
        ? db.collection('usernames').doc(previousUsername)
        : null;
      const previousUsernameSnap = previousUsernameRef
        ? await transaction.get(previousUsernameRef)
        : null;

      transaction.set(usernameRef, {
        name: username,
        userId: identity.uid,
        claimedAt: FieldValue.serverTimestamp(),
      });
      if (previousUsernameRef && previousUsernameSnap?.data()?.userId === identity.uid) {
        transaction.delete(previousUsernameRef);
      }
      transaction.update(userRef, {
        username,
        lastUsernameChange: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      const privacySettings = profile.privacySettings && typeof profile.privacySettings === 'object'
        ? profile.privacySettings as Record<string, unknown>
        : {};
      transaction.set(db.collection('publicProfiles').doc(identity.uid), {
        uid: identity.uid,
        isPublic: profile.isProfilePublic === true || profile.profileVisibility === 'public',
        username,
        photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : '',
        bio: typeof profile.bio === 'string' ? profile.bio : '',
        interests: Array.isArray(profile.interests) ? profile.interests.slice(0, 20) : [],
        ...(privacySettings.showSocialLinks === true ? Object.fromEntries(
          ['githubUrl', 'linkedinUrl', 'twitterUrl', 'websiteUrl', 'title']
            .flatMap((key) => typeof profile[key] === 'string' ? [[key, profile[key]]] : []),
        ) : {}),
        privacySettings: Object.fromEntries(
          ['showRating', 'showStats', 'showActivity', 'showAchievements', 'showFriends',
            'showSocialLinks', 'showMatchHistory', 'showTopicMastery', 'showBadges']
            .map((key) => [key, privacySettings[key] === true]),
        ),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { status: 'updated' as const };
    });

    if (result.status === 'not-found') {
      return NextResponse.json({ error: 'User profile not found.' }, { status: 404 });
    }
    if (result.status === 'taken') {
      return NextResponse.json({ error: 'Username is already taken.' }, { status: 409 });
    }
    if (result.status === 'cooldown') {
      return NextResponse.json({
        error: 'Username can only be changed once every seven days.',
        retryAfterMs: result.remainingMs,
      }, { status: 429 });
    }

    return NextResponse.json({ success: true, username, unchanged: result.status === 'unchanged' });
  } catch (error) {
    console.error('[Username Update] Failed to update username', error);
    return NextResponse.json({ error: 'Unable to update username.' }, { status: 500 });
  }
}
