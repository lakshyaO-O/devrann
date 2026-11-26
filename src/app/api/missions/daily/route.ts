import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';
import { countVerifiedMissionProgress } from '@/lib/daily-missions';

const MISSION_TEMPLATES = [
  {
    type: 'practice',
    title: 'Solve 3 Practice Problems',
    description: 'Get accepted on three different practice problems today.',
    requirement: 3,
    xpReward: 50,
    coinReward: 25,
    difficulty: 'easy',
  },
  {
    type: 'arena',
    title: 'Complete an Arena Match',
    description: 'Finish a verified Arena match today.',
    requirement: 1,
    xpReward: 75,
    coinReward: 30,
    difficulty: 'easy',
  },
] as const;

async function authenticate(request: NextRequest) {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;

  try {
    return await getAdminAuth().verifyIdToken(authorization.slice(7));
  } catch {
    return null;
  }
}

function getUtcDay() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    id: start.toISOString().slice(0, 10),
    start,
    end,
    expiresAt: end.toISOString(),
  };
}

async function getVerifiedProgress(uid: string, start: Date, end: Date) {
  const db = getAdminFirestore();
  const userRef = db.collection('users').doc(uid);
  const [submissions, matches] = await Promise.all([
    userRef.collection('submissions')
      .where('submittedAt', '>=', Timestamp.fromDate(start))
      .where('submittedAt', '<', Timestamp.fromDate(end))
      .get(),
    userRef.collection('matches')
      .where('timestamp', '>=', start.toISOString())
      .where('timestamp', '<', end.toISOString())
      .get(),
  ]);

  return countVerifiedMissionProgress(
    submissions.docs.map((submission) => submission.data()),
    matches.docs.map((match) => match.data()),
  );
}

export async function GET(request: NextRequest) {
  try {
    const identity = await authenticate(request);
    if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limited = await enforceSharedRateLimit(identity.uid, 'missions.daily.read', {
      windowMs: 60_000,
      maxRequests: 60,
    });
    if (limited) return limited;

    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(identity.uid);
    const day = getUtcDay();
    const progress = await getVerifiedProgress(identity.uid, day.start, day.end);
    const missions = await Promise.all(MISSION_TEMPLATES.map(async (template) => {
      const id = `${day.id}-${template.type}`;
      const ref = userRef.collection('missions').doc(id);
      const claimed = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) {
          transaction.create(ref, {
            ...template,
            claimed: false,
            expiresAt: day.expiresAt,
          });
        }
        return snapshot.data()?.claimed === true;
      });
      const missionProgress = Math.min(progress[template.type], template.requirement);
      return {
        id,
        ...template,
        progress: missionProgress,
        completed: missionProgress >= template.requirement,
        claimed,
        expiresAt: day.expiresAt,
      };
    }));

    return NextResponse.json({ missions, day: day.id });
  } catch (error) {
    console.error('[Daily Missions GET] Failed to load missions', error);
    return NextResponse.json({ error: 'Unable to load daily missions.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await authenticate(request);
    if (!identity) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const limited = await enforceSharedRateLimit(identity.uid, 'missions.daily.claim', {
      windowMs: 60_000,
      maxRequests: 10,
    });
    if (limited) return limited;

    const body = await request.json().catch(() => null);
    if (!body || typeof body.missionId !== 'string') {
      return NextResponse.json({ error: 'A missionId is required.' }, { status: 400 });
    }

    const day = getUtcDay();
    const template = MISSION_TEMPLATES.find((mission) => body.missionId === `${day.id}-${mission.type}`);
    if (!template) return NextResponse.json({ error: 'Mission not found.' }, { status: 404 });

    const progress = await getVerifiedProgress(identity.uid, day.start, day.end);
    if (progress[template.type] < template.requirement) {
      return NextResponse.json({ error: 'Complete the verified mission requirements before claiming.' }, { status: 409 });
    }

    const db = getAdminFirestore();
    const missionRef = db.collection('users').doc(identity.uid).collection('missions').doc(body.missionId);
    const userRef = db.collection('users').doc(identity.uid);
    const learningRef = db.collection('learning').doc(identity.uid);
    const result = await db.runTransaction(async (transaction) => {
      const [missionSnapshot, userSnapshot] = await Promise.all([
        transaction.get(missionRef),
        transaction.get(userRef),
      ]);
      if (!missionSnapshot.exists || !userSnapshot.exists) return 'not-found' as const;
      if (missionSnapshot.data()?.claimed === true) return 'already-claimed' as const;

      transaction.update(missionRef, { claimed: true, claimedAt: FieldValue.serverTimestamp() });
      transaction.update(userRef, {
        xp: FieldValue.increment(template.xpReward),
        coins: FieldValue.increment(template.coinReward),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(learningRef, {
        xp: FieldValue.increment(template.xpReward),
        coins: FieldValue.increment(template.coinReward),
        lastSynced: FieldValue.serverTimestamp(),
      }, { merge: true });
      return 'claimed' as const;
    });

    if (result === 'not-found') return NextResponse.json({ error: 'Mission not found.' }, { status: 404 });
    if (result === 'already-claimed') return NextResponse.json({ error: 'Mission reward was already claimed.' }, { status: 409 });

    return NextResponse.json({ success: true, xpReward: template.xpReward, coinReward: template.coinReward });
  } catch (error) {
    console.error('[Daily Missions POST] Failed to claim mission reward', error);
    return NextResponse.json({ error: 'Unable to claim mission reward.' }, { status: 500 });
  }
}
