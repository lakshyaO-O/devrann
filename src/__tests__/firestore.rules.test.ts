import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-devrann-rules';
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, 'users/alice'), { uid: 'alice', role: 'user', xp: 0, rating: 1200 }),
      setDoc(doc(db, 'users/bob'), { uid: 'bob', role: 'user', xp: 0, rating: 1200 }),
      setDoc(doc(db, 'users/admin'), { uid: 'admin', role: 'admin', xp: 0, rating: 1200 }),
      setDoc(doc(db, 'publicProfiles/bob'), {
        uid: 'bob',
        isPublic: true,
        username: 'bob',
        privacySettings: { showRating: true },
      }),
    ]);
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore security rules', () => {
  it('keeps private user documents owner-only and public profiles opt-in', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const anonymousDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(aliceDb, 'users/bob')));
    await assertSucceeds(getDoc(doc(aliceDb, 'users/alice')));
    await assertFails(getDoc(doc(anonymousDb, 'publicProfiles/bob')));
    await assertSucceeds(getDoc(doc(aliceDb, 'publicProfiles/bob')));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'publicProfiles/bob'), { isPublic: false });
    });
    await assertFails(getDoc(doc(aliceDb, 'publicProfiles/bob')));
  });

  it('denies client notification creation and direct friend-state transitions', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();

    await assertFails(setDoc(doc(aliceDb, 'users/bob/notifications/forged'), {
      type: 'friend_request',
      userId: 'bob',
      read: false,
    }));
    await assertFails(setDoc(doc(aliceDb, 'users/alice/friends/bob'), {
      userId: 'alice',
      friendId: 'bob',
      status: 'accepted',
    }));
    await assertFails(setDoc(doc(aliceDb, 'users/bob/friendRequests/alice'), {
      fromUserId: 'alice',
      toUserId: 'bob',
      status: 'pending',
    }));
    await assertFails(setDoc(doc(aliceDb, 'invites/forged'), {
      fromUserId: 'alice',
      toUserId: 'bob',
      roomId: 'missing-room',
      roomCode: 'ABC123',
      status: 'pending',
    }));
  });

  it('allows only trusted server writes for a legitimate accepted friendship and notification', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'users/bob/friendRequests/request-alice'), {
        fromUserId: 'alice',
        toUserId: 'bob',
        status: 'pending',
      });
      await updateDoc(doc(db, 'users/bob/friendRequests/request-alice'), { status: 'accepted' });
      await setDoc(doc(db, 'users/alice/friends/bob'), {
        userId: 'alice',
        friendId: 'bob',
        status: 'accepted',
      });
      await setDoc(doc(db, 'users/bob/friends/alice'), {
        userId: 'bob',
        friendId: 'alice',
        status: 'accepted',
      });
      await setDoc(doc(db, 'users/alice/notifications/friend-accepted'), {
        userId: 'alice',
        type: 'friend_accepted',
        read: false,
      });
    });

    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const bobDb = testEnv.authenticatedContext('bob').firestore();
    await assertSucceeds(getDoc(doc(aliceDb, 'users/alice/friends/bob')));
    await assertSucceeds(getDoc(doc(bobDb, 'users/bob/friends/alice')));
    await assertSucceeds(getDoc(doc(aliceDb, 'users/alice/notifications/friend-accepted')));
  });

  it('allows trusted server invite creation but denies client-side invite updates', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'invites/room-invite'), {
        fromUserId: 'alice',
        toUserId: 'bob',
        roomId: 'room-1',
        roomCode: 'ABC123',
        status: 'pending',
      });
    });

    const bobDb = testEnv.authenticatedContext('bob').firestore();
    await assertSucceeds(getDoc(doc(bobDb, 'invites/room-invite')));
    await assertFails(updateDoc(doc(bobDb, 'invites/room-invite'), { status: 'accepted' }));
  });

  it('protects account and ranking fields even from administrators using client SDK', async () => {
    const aliceDb = testEnv.authenticatedContext('alice').firestore();
    const adminDb = testEnv.authenticatedContext('admin').firestore();

    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { xp: 100000 }));
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { rating: 5000 }));
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { subscriptionTier: 'premium' }));
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), { editorFontSize: 100 }));
    await assertFails(updateDoc(doc(aliceDb, 'users/alice'), {
      notificationPreferences: { inAppEnabled: true, soundEnabled: true, isAdmin: true },
    }));
    await assertFails(setDoc(doc(aliceDb, 'users/alice/challenges/daily'), {
      date: '2099-01-01',
      claimed: true,
      xpEarned: 100000,
    }));
    await assertFails(setDoc(doc(aliceDb, 'users/alice/achievements/fake'), { xpAwarded: 100000 }));
    await assertFails(updateDoc(doc(adminDb, 'users/alice'), { role: 'super_admin' }));
    await assertSucceeds(updateDoc(doc(aliceDb, 'users/alice'), { onboardingCompleted: true }));
  });

  it('denies unauthenticated access to private documents and private subcollections', async () => {
    const anonymousDb = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(anonymousDb, 'users/alice')));
    await assertFails(getDoc(doc(anonymousDb, 'users/alice/friends/bob')));
    await assertFails(getDoc(doc(anonymousDb, 'users/alice/notifications/item')));
  });
});
