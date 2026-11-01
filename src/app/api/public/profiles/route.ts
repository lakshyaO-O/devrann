import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { checkRateLimit, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function toIso(value: unknown): string | undefined {
  if (value && typeof value === 'object' && 'toDate' in value
    && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return undefined;
}

function publicFlags(data: FirebaseFirestore.DocumentData) {
  const source = data.privacySettings && typeof data.privacySettings === 'object'
    ? data.privacySettings as Record<string, unknown>
    : {};
  return {
    showRating: source.showRating === true,
    showStats: source.showStats === true,
    showActivity: source.showActivity === true,
    showAchievements: source.showAchievements === true,
    showFriends: source.showFriends === true,
    showSocialLinks: source.showSocialLinks === true,
    showMatchHistory: source.showMatchHistory === true,
    showTopicMastery: source.showTopicMastery === true,
    showBadges: source.showBadges === true,
  };
}

function profileProjection(id: string, data: FirebaseFirestore.DocumentData) {
  const flags = publicFlags(data);
  const result: Record<string, unknown> = {
    id,
    uid: id,
    username: typeof data.username === 'string' ? data.username : '',
    photoURL: typeof data.photoURL === 'string' ? data.photoURL : '',
    bio: typeof data.bio === 'string' ? data.bio : '',
    createdAt: toIso(data.createdAt) || null,
    privacySettings: flags,
  };

  if (Array.isArray(data.interests)) result.interests = data.interests.slice(0, 20);
  if (flags.showRating) {
    for (const key of ['rating', 'highestRating', 'tier']) {
      if (typeof data[key] === 'string' || typeof data[key] === 'number') result[key] = data[key];
    }
  }
  if (flags.showStats) {
    for (const key of ['wins', 'losses', 'draws', 'totalGamesPlayed', 'problemsSolved', 'streak', 'level', 'xp']) {
      if (typeof data[key] === 'number') result[key] = data[key];
    }
  }
  if (flags.showBadges && Array.isArray(data.badges)) result.badges = data.badges.slice(0, 50);
  if (flags.showAchievements && Array.isArray(data.achievements)) {
    result.achievements = data.achievements.slice(0, 50);
  }
  if (flags.showSocialLinks) {
    for (const key of ['githubUrl', 'linkedinUrl', 'twitterUrl', 'websiteUrl', 'title']) {
      if (typeof data[key] === 'string') result[key] = data[key];
    }
  }
  if (flags.showTopicMastery && data.topicMastery && typeof data.topicMastery === 'object'
    && !Array.isArray(data.topicMastery)) {
    result.topicMastery = Object.fromEntries(
      Object.entries(data.topicMastery as Record<string, unknown>)
        .slice(0, 100)
        .flatMap(([topic, value]) => {
          if (!value || typeof value !== 'object') return [];
          const item = value as Record<string, unknown>;
          if (typeof item.solved !== 'number' || typeof item.total !== 'number') return [];
          return [[topic, { solved: item.solved, total: item.total }]];
        }),
    );
  }
  return result;
}

async function optionalUid(request: NextRequest): Promise<string | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization) return null;
  if (!authorization.startsWith('Bearer ')) throw new Error('Invalid authorization header');
  const identity = await getAdminAuth().verifyIdToken(authorization.slice(7));
  return identity.uid;
}

function serializeRows(snapshot: FirebaseFirestore.QuerySnapshot) {
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id,
      ...Object.fromEntries(
        Object.entries(data).filter(([key, value]) =>
          ['type', 'title', 'description', 'problemId', 'result', 'verdict', 'username', 'photoURL', 'tier',
            'friendId', 'onlineStatus', 'rating', 'outcome', 'opponent', 'difficulty'].includes(key)
          && (typeof value === 'string' || typeof value === 'number'),
        ),
      ),
      ...(toIso(data.timestamp || data.createdAt || data.submittedAt)
        ? { timestamp: toIso(data.timestamp || data.createdAt || data.submittedAt) }
        : {}),
    };
  });
}

function publicMatchHistory(snapshot: FirebaseFirestore.QuerySnapshot, uid: string) {
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    const result = data.result;
    const opponentId = typeof data.opponentId === 'string' ? data.opponentId : '';
    const yourScore = typeof data.yourScore === 'number' ? data.yourScore : 0;
    const opponentScore = typeof data.opponentScore === 'number' ? data.opponentScore : 0;
    const eloChange = typeof data.eloChange === 'number' ? data.eloChange : 0;
    return {
      id: entry.id,
      players: [
        { uid, score: yourScore, eloChange },
        { uid: opponentId, username: typeof data.opponentName === 'string' ? data.opponentName : 'Player', score: opponentScore },
      ],
      winnerIds: result === 'WIN' ? [uid] : result === 'LOSS' ? [opponentId] : ['draw'],
      problem: data.problem && typeof data.problem === 'object'
        ? { title: typeof data.problem.title === 'string' ? data.problem.title : 'Match' }
        : { title: 'Match' },
      timestamp: typeof data.timestamp === 'string' ? data.timestamp : toIso(data.timestamp) || '',
    };
  });
}

export async function GET(request: NextRequest) {
  const rate = checkRateLimit('public-profiles', request, { windowMs: 60_000, maxRequests: 60 });
  if (!rate.allowed) return rateLimitResponse(rate.retryAfterMs);

  try {
    const db = getAdminFirestore();
    const params = request.nextUrl.searchParams;
    const uid = params.get('uid')?.trim();
    const username = params.get('username')?.trim().toLowerCase();
    const queryText = params.get('q')?.trim().toLowerCase();

    if (queryText) {
      if (queryText.length < 2 || queryText.length > 20) {
        return NextResponse.json({ error: 'Search text must be 2–20 characters.' }, { status: 400 });
      }
      const snapshot = await db.collection('publicProfiles')
        .where('isPublic', '==', true)
        .orderBy('username')
        .startAt(queryText)
        .endAt(`${queryText}\uf8ff`)
        .limit(50)
        .get();
      const profiles = (await Promise.all(snapshot.docs.slice(0, 50).map(async (entry) => {
        const [publicData, userSnap] = await Promise.all([
          Promise.resolve(entry.data()),
          db.collection('users').doc(entry.id).get(),
        ]);
        if (!userSnap.exists || userSnap.data()?.banned === true) return null;
        if (publicData.isPublic !== true) return null;
        return profileProjection(entry.id, userSnap.data()!);
      }))).filter(Boolean).slice(0, 20);
      return NextResponse.json({ profiles }, {
        headers: { 'Cache-Control': 'private, max-age=15' },
      });
    }

    if ((!uid && !username) || (uid && username)) {
      return NextResponse.json({ error: 'Provide exactly one profile identifier.' }, { status: 400 });
    }

    let viewerUid: string | null = null;
    try {
      viewerUid = await optionalUid(request);
    } catch {
      return NextResponse.json({ error: 'Invalid authentication token.' }, { status: 401 });
    }

    let profileId = uid;
    let publicData: FirebaseFirestore.DocumentData | null = null;
    if (uid) {
      const publicSnap = await db.collection('publicProfiles').doc(uid).get();
      if (publicSnap.exists && publicSnap.data()?.isPublic === true) publicData = publicSnap.data()!;
    } else {
      const publicSnap = await db.collection('publicProfiles')
        .where('isPublic', '==', true)
        .where('username', '==', username)
        .limit(1)
        .get();
      if (!publicSnap.empty) {
        profileId = publicSnap.docs[0].id;
        publicData = publicSnap.docs[0].data();
      }
    }

    let userSnap = profileId ? await db.collection('users').doc(profileId).get() : null;
    if ((!userSnap?.exists || !publicData) && username && viewerUid) {
      const ownedProfile = await db.collection('users').where('username', '==', username).limit(1).get();
      if (!ownedProfile.empty && ownedProfile.docs[0].id === viewerUid) {
        profileId = viewerUid;
        userSnap = ownedProfile.docs[0];
      }
    }

    const ownerView = profileId === viewerUid;
    if (!profileId || !userSnap?.exists || (!ownerView && !publicData)) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    const data = userSnap.data()!;
    if (data.banned === true) return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    const profile = profileProjection(profileId, data);
    const flags = publicFlags(data);
    const [friends, activity, matchHistory] = await Promise.all([
      flags.showFriends
        ? db.collection('users').doc(profileId).collection('friends').limit(50).get()
        : null,
      flags.showActivity
        ? db.collection('users').doc(profileId).collection('activity').orderBy('timestamp', 'desc').limit(10).get()
        : null,
      flags.showMatchHistory
        ? db.collection('users').doc(profileId).collection('matches').orderBy('timestamp', 'desc').limit(10).get()
        : null,
    ]);

    return NextResponse.json({
      profile,
      friends: friends ? serializeRows(friends) : [],
      activity: activity ? serializeRows(activity) : [],
      matchHistory: matchHistory ? publicMatchHistory(matchHistory, profileId) : [],
    }, { headers: { 'Cache-Control': ownerView ? 'private, no-store' : 'public, max-age=30' } });
  } catch (error) {
    console.error('[PublicProfiles GET] Failed to load profiles', error);
    return NextResponse.json({ error: 'Profiles are temporarily unavailable.' }, { status: 503 });
  }
}
