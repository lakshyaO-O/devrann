import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminAuth, getAdminFirestore } from '@/firebase/admin';
import { enforceSharedRateLimit } from '@/lib/rate-limit';
import { lessons } from '@/data/lessons';

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
  const limited = await enforceSharedRateLimit(uid, 'learning.lesson-completion', {
    windowMs: 60_000,
    maxRequests: 10,
  });
  if (limited) return limited;

  const body = await request.json().catch(() => null);
  const lessonId = body?.lessonId;
  const answers = body?.answers;
  const lesson = lessons.find((item) => item.id === lessonId);
  if (!lesson || !Array.isArray(answers) || answers.length !== lesson.quiz.length
    || answers.some((answer: unknown, index: number) =>
      !Number.isInteger(answer) || (answer as number) < 0 || (answer as number) >= lesson.quiz[index].options.length,
    )) {
    return NextResponse.json({ error: 'Invalid lesson completion data.' }, { status: 400 });
  }
  const correctCount = answers.reduce(
    (count: number, answer: number, index: number) => count + (answer === lesson.quiz[index].correctIndex ? 1 : 0),
    0,
  );
  if (correctCount < Math.ceil(lesson.quiz.length * 0.6)) {
    return NextResponse.json({ error: 'Pass the lesson quiz before claiming its reward.' }, { status: 409 });
  }

  try {
    const db = getAdminFirestore();
    const userRef = db.collection('users').doc(uid);
    const learningRef = db.collection('learning').doc(uid);
    const result = await db.runTransaction(async (tx) => {
      const [userSnap, learningSnap] = await Promise.all([tx.get(userRef), tx.get(learningRef)]);
      if (!userSnap.exists || userSnap.data()?.banned === true) {
        return { error: 'Account unavailable.', status: 403 } as const;
      }

      const learning = learningSnap.data() || {};
      const completed: number[] = Array.isArray(learning.lessonsCompleted) ? learning.lessonsCompleted : [];
      const currentProgress = learning.lessonProgress && typeof learning.lessonProgress === 'object'
        ? learning.lessonProgress
        : {};
      const previousLessonProgress = currentProgress[lesson.id] && typeof currentProgress[lesson.id] === 'object'
        ? currentProgress[lesson.id]
        : {};
      if (completed.includes(lesson.id) || previousLessonProgress.xpAwarded === true) {
        return {
          alreadyCompleted: true,
          xp: Number(userSnap.data()?.xp) || 0,
          coins: Number(userSnap.data()?.coins) || 0,
          xpAwarded: 0,
          coinsAwarded: 0,
        } as const;
      }

      const progress = {
        ...previousLessonProgress,
        read: true,
        quizPassed: true,
        xpAwarded: true,
        completedAt: new Date().toISOString(),
      };
      tx.set(learningRef, {
        lessonsCompleted: FieldValue.arrayUnion(lesson.id),
        lessonProgress: { [lesson.id]: progress },
        currentLesson: Math.max(Number(learning.currentLesson) || 1, lesson.id + 1),
        xp: FieldValue.increment(lesson.xpReward),
        coins: FieldValue.increment(lesson.coinReward),
        lastSynced: FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.update(userRef, {
        xp: FieldValue.increment(lesson.xpReward),
        coins: FieldValue.increment(lesson.coinReward),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        alreadyCompleted: false,
        xp: (Number(userSnap.data()?.xp) || 0) + lesson.xpReward,
        coins: (Number(userSnap.data()?.coins) || 0) + lesson.coinReward,
        xpAwarded: lesson.xpReward,
        coinsAwarded: lesson.coinReward,
      } as const;
    });

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Lesson Completion] Transaction failed.', error);
    return NextResponse.json({ error: 'Lesson rewards are temporarily unavailable.' }, { status: 503 });
  }
}
