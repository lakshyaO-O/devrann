import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
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
    const { username } = await request.json();

    if (!username || typeof username !== 'string' || username.trim().length < 2) {
      return NextResponse.json({ error: 'Username must be at least 2 characters' }, { status: 400 });
    }

    if (username.trim().length > 20) {
      return NextResponse.json({ error: 'Username must be at most 20 characters' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores' }, { status: 400 });
    }

    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    const publicProfileRef = db.collection('publicProfiles').doc(uid);
    const existingUser = await userRef.get();

    if (existingUser.exists) {
      return NextResponse.json({ error: 'User profile already exists' }, { status: 409 });
    }

    const usernameLower = username.trim().toLowerCase();
    const usernameRef = db.collection('usernames').doc(usernameLower);

    let publicId: string;
    try {
      publicId = await db.runTransaction(async (transaction) => {
        const [profileDoc, usernameDoc] = await Promise.all([
          transaction.get(userRef),
          transaction.get(usernameRef),
        ]);
        if (profileDoc.exists) {
          throw new Error('User profile already exists');
        }
        if (usernameDoc.exists) {
          throw new Error('Username already taken');
        }

        const candidate = 'u_' + Array.from({ length: 12 }, () =>
          'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]
        ).join('');
        const privacySettings = {
          showRating: false,
          showStats: false,
          showActivity: false,
          showAchievements: false,
          showFriends: false,
          showSocialLinks: false,
          showMatchHistory: false,
          showTopicMastery: false,
          showBadges: false,
        };

        transaction.set(userRef, {
          uid,
          publicId: candidate,
          username: username.trim(),
          email: decodedToken.email || '',
          photoURL: decodedToken.picture || '',
          coins: 0,
          xp: 0,
          level: 1,
          rating: 1200,
          highestRating: 1200,
          highestScore: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          totalGamesPlayed: 0,
          tier: 'Beginner',
          rank: 0,
          role: 'user',
          isProfilePublic: false,
          profileVisibility: 'private',
          privacySettings,
          lastActive: FieldValue.serverTimestamp(),
          onlineStatus: 'online',
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });

        transaction.set(usernameRef, {
          name: usernameLower,
          userId: uid,
          claimedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(publicProfileRef, {
          uid,
          isPublic: false,
          username: username.trim(),
          photoURL: decodedToken.picture || '',
          bio: '',
          interests: [],
          privacySettings,
          updatedAt: FieldValue.serverTimestamp(),
        });

        return candidate;
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'User profile already exists') {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }

    try {
      await db.collection('leaderboard').doc(uid).set({
        userId: uid,
        username: username.trim(),
        photoURL: decodedToken.picture || '',
        rating: 1200,
        wins: 0,
        tier: 'Beginner',
        period: 'all-time',
        periodStart: FieldValue.serverTimestamp(),
        periodEnd: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch {
      // non-critical
    }

    return NextResponse.json({ success: true, uid, publicId });
  } catch (err: any) {
    console.error('[Auth Create Profile] Error:', err);
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
