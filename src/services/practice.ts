'use client';

import { initializeFirebase } from '@/firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc,
  query, where, orderBy, limit, serverTimestamp, runTransaction, Timestamp,
  increment,
} from 'firebase/firestore';
import type { QueryDocumentSnapshot, DocumentData, Transaction } from 'firebase/firestore';
import type {
  PracticeProblemDocument, PracticeProblemSummary, PracticeSubmission, Verdict, SubmissionStatus,
  UserPracticeProgress, RecentlyViewedProblem, CodingLanguage,
  ProblemContent, ProblemDocumentMeta, PracticeDraft, TestCaseResult,
} from '@/types';
import { createApiJudge } from '@/features/practice/services/api-judge';

const judge = createApiJudge();

export interface ProblemCatalogStats {
  total: number;
  difficulty: Record<'Easy' | 'Medium' | 'Hard', number>;
  topics: Record<string, number> | null;
  topicsAvailable: boolean;
  generatedAt: string;
}

export async function fetchProblemStats(): Promise<ProblemCatalogStats> {
  const { auth } = initializeFirebase();
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in to load problem statistics.');
  const token = await user.getIdToken();
  const response = await fetch('/api/problems/stats', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Problem statistics are temporarily unavailable.');
  return data as ProblemCatalogStats;
}

export async function fetchProblems(): Promise<PracticeProblemSummary[]> {
  const problems: PracticeProblemSummary[] = [];
  let cursor: string | null = null;
  let hasMore = true;
  while (hasMore) {
    const page = await fetchProblemPage({ cursor });
    problems.push(...page.problems);
    cursor = page.nextCursor;
    hasMore = page.hasMore;
  }
  return problems;
}

export interface ProblemCatalogPage {
  problems: PracticeProblemSummary[];
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
}

export interface ProblemCatalogQuery {
  search?: string;
  difficulty?: string;
  topic?: string;
  sort?: 'title' | 'difficulty' | 'points-asc' | 'points-desc';
  status?: 'all' | 'solved' | 'unsolved' | 'attempted' | 'bookmarked';
  cursor?: string | null;
}

export async function fetchProblemPage(
  options: ProblemCatalogQuery = {},
): Promise<ProblemCatalogPage> {
  const { auth } = initializeFirebase();
  if (!auth?.currentUser) throw new Error('Sign in to load published problems.');
  const token = await auth.currentUser.getIdToken();
  const params = new URLSearchParams({ limit: '25' });
  if (options.search?.trim()) params.set('search', options.search.trim());
  if (options.difficulty) params.set('difficulty', options.difficulty);
  if (options.topic) params.set('topic', options.topic);
  if (options.sort) params.set('sort', options.sort);
  if (options.status && options.status !== 'all') params.set('status', options.status);
  if (options.cursor) params.set('cursor', options.cursor);
  const response = await fetch(`/api/problems?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Problem catalog is unavailable.');
  }
  if (!Array.isArray(data.problems)
    || (data.nextCursor !== null && typeof data.nextCursor !== 'string')
    || typeof data.hasMore !== 'boolean'
    || typeof data.pageSize !== 'number') {
    throw new Error('Problem catalog returned an invalid response.');
  }
  return data as ProblemCatalogPage;
}

export async function fetchProblem(problemId: string): Promise<PracticeProblemDocument | null> {
  return getPublishedProblem(problemId);
}

export function problemDocRef(problemId: string) {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  return doc(db, 'problems', problemId);
}

export function userProgressDocRef(userId: string, problemId: string) {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  return doc(db, 'users', userId, 'practiceProgress', problemId);
}

export function submissionsColRef(userId: string) {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  return collection(db, 'users', userId, 'submissions');
}

export async function getUserProgress(userId: string, problemId: string): Promise<UserPracticeProgress | null> {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', userId, 'practiceProgress', problemId));
  return snap.exists() ? ({ problemId, ...snap.data() } as UserPracticeProgress) : null;
}

export async function getAllUserProgress(userId: string): Promise<UserPracticeProgress[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const q = query(collection(db, 'users', userId, 'practiceProgress'));
  const snap = await getDocs(q);
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ problemId: d.id, ...d.data() } as UserPracticeProgress));
}

export async function markSolved(userId: string, problemId: string, submissionId: string, rating: number) {
  const { firestore: db } = initializeFirebase();
  if (!db) return;
  const ref = doc(db, 'users', userId, 'practiceProgress', problemId);
  await setDoc(ref, {
    solved: true,
    bestSubmissionId: submissionId,
    rating,
    lastSubmittedAt: serverTimestamp(),
    bookmarked: false,
  }, { merge: true });
}

export async function toggleBookmark(userId: string, problemId: string, current: boolean) {
  const { firestore: db } = initializeFirebase();
  if (!db) return;
  const ref = doc(db, 'users', userId, 'practiceProgress', problemId);
  await setDoc(ref, { bookmarked: !current }, { merge: true });
}

export async function saveNotes(userId: string, problemId: string, notes: string) {
  const { firestore: db } = initializeFirebase();
  if (!db) return;
  const ref = doc(db, 'users', userId, 'practiceProgress', problemId);
  await setDoc(ref, { notes }, { merge: true });
}

export async function saveCode(userId: string, problemId: string, language: CodingLanguage, code: string) {
  const { firestore: db } = initializeFirebase();
  if (!db) return;
  const ref = doc(db, 'users', userId, 'savedCode', problemId);
  await setDoc(ref, {
    problemId, language, code,
    lastModified: serverTimestamp(),
  }, { merge: true });
}

export async function loadSavedCode(userId: string, problemId: string): Promise<string | null> {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', userId, 'savedCode', problemId));
  return snap.exists() ? snap.data().code : null;
}

export async function submitSolution(
  userId: string, username: string,
  problemId: string, language: CodingLanguage, code: string,
  _testCases?: Array<{ input: string; expected: string; isHidden?: boolean }>,
  onProgress?: (progress: any) => void,
): Promise<{ submission: PracticeSubmission; results: TestCaseResult[]; compileTimeMs?: number; codeSize?: number }> {
  // Judging and stats now happen server-side: the client never supplies test cases
  // and cannot author verdicts/XP.
  const { auth } = initializeFirebase();
  if (!auth?.currentUser) {
    throw new Error('Not authenticated');
  }
  const idToken = await auth.currentUser.getIdToken();

  onProgress?.({ phase: 'compiling', message: 'Submitting code for execution...' });

  const res = await fetch('/api/judge/practice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ problemId, language, code }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    onProgress?.({ phase: 'error', message: data?.error || 'Submission failed' });
    throw new Error(data?.error || 'Submission failed');
  }

  onProgress?.({ phase: 'finished', message: 'Execution complete' });

  const results: TestCaseResult[] = data.results || [];
  const validVerdicts: Verdict[] = [
    'Accepted', 'Wrong Answer', 'Runtime Error', 'Compilation Error',
    'Time Limit Exceeded', 'Memory Limit Exceeded',
  ];
  if (!data.submission || !validVerdicts.includes(data.submission.verdict)) {
    throw new Error('Judge returned an invalid submission response.');
  }
  const submission: PracticeSubmission = {
    id: data.submission.id,
    userId, problemId, language, code,
    verdict: data.submission.verdict,
    passedTestCases: data.submission.passedTestCases,
    totalTestCases: data.submission.totalTestCases,
    executionTimeMs: data.submission.executionTimeMs,
    memoryUsedKb: data.submission.memoryUsedKb,
    submittedAt: data.submission.submittedAt,
  };

  return { submission, results, compileTimeMs: data.compileTimeMs, codeSize: data.codeSize };
}

export async function runPublicTests(
  problemId: string,
  language: CodingLanguage,
  code: string,
  testCases: Array<{ input: string; expected: string; isHidden?: boolean }>,
  timeLimitMs = 5000,
  memoryLimitKb = 512000,
): Promise<{ testCaseResults: TestCaseResult[]; executionTimeMs: number; memoryUsedKb: number; compileTimeMs: number; codeSize: number }> {
  const { auth } = initializeFirebase();
  if (!auth?.currentUser) throw new Error('Sign in to run code.');

  const visibleCases = testCases.filter((testCase) => !testCase.isHidden).slice(0, 3);
  if (visibleCases.length === 0) throw new Error('This problem has no public sample tests configured.');

  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch('/api/judge/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({
      problemId,
      language,
      code,
      testCases: visibleCases.map(({ input, expected }) => ({ input, expected, isHidden: false })),
      timeLimitMs,
      memoryLimitKb,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `Sample test execution failed (${response.status}).`);
  }

  return {
    testCaseResults: Array.isArray(data.testCaseResults) ? data.testCaseResults : [],
    executionTimeMs: Number(data.executionTimeMs) || 0,
    memoryUsedKb: Number(data.memoryUsedKb) || 0,
    compileTimeMs: Number(data.compileTimeMs) || 0,
    codeSize: Number(data.codeSize) || 0,
  };
}

export async function fetchSubmissions(userId: string, problemId?: string): Promise<PracticeSubmission[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const constraints: any[] = [orderBy('submittedAt', 'desc'), limit(20)];
  if (problemId) constraints.unshift(where('problemId', '==', problemId));
  const q = query(collection(db, 'users', userId, 'submissions'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data(), submittedAt: d.data().submittedAt?.toMillis?.()?.toString() || '' } as unknown as PracticeSubmission));
}

export async function trackRecentlyViewed(userId: string, problem: { id: string; title: string; difficulty: string }) {
  const { firestore: db } = initializeFirebase();
  if (!db) return;
  const ref = doc(db, 'users', userId, 'recentlyViewed', problem.id);
  await setDoc(ref, {
    problemId: problem.id, title: problem.title, difficulty: problem.difficulty,
    viewedAt: serverTimestamp(),
  }, { merge: true });
}

export async function fetchRecentlyViewed(userId: string, max = 5): Promise<RecentlyViewedProblem[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const q = query(
    collection(db, 'users', userId, 'recentlyViewed'),
    orderBy('viewedAt', 'desc'), limit(max),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => d.data() as RecentlyViewedProblem);
}

export async function fetchDiscussion(problemId: string): Promise<any[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const q = query(
    collection(db, 'problems', problemId, 'discussion'),
    orderBy('createdAt', 'desc'), limit(50),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() }));
}

export async function postDiscussion(problemId: string, userId: string, username: string, message: string) {
  const { firestore: db } = initializeFirebase();
  if (!db) return;
  await addDoc(collection(db, 'problems', problemId, 'discussion'), {
    userId, username, message, createdAt: serverTimestamp(),
  });
}

// ===== DAILY CHALLENGE =====

export async function getDailyChallenge(date?: string): Promise<{ date: string; problemId: string; xpBonus: number } | null> {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  const today = date || new Date().toISOString().slice(0, 10);
  const snap = await getDoc(doc(db, 'challenges', 'daily'));
  if (!snap.exists()) return null;
  const data = snap.data();
  const challenges = data.challenges || [];
  return challenges.find((c: any) => c.date === today) || null;
}

export async function claimDailyChallengeXp(userId: string) {
  const { auth } = initializeFirebase();
  const user = auth?.currentUser;
  if (!user || user.uid !== userId) throw new Error('You must be signed in to claim this reward.');
  const token = await user.getIdToken();
  const response = await fetch('/api/challenges/claim', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Unable to claim the daily challenge reward.');
  return typeof result.xpAwarded === 'number' ? result.xpAwarded : 0;
}

export async function getDailyChallengeStatus(userId: string): Promise<{ completed: boolean; claimed: boolean; date: string } | null> {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  const today = new Date().toISOString().slice(0, 10);
  const snap = await getDoc(doc(db, 'users', userId, 'challenges', 'daily'));
  if (!snap.exists()) return { completed: false, claimed: false, date: today };
  const data = snap.data();
  return { completed: data.date === today, claimed: data.claimed || false, date: today };
}

// ===== WEEKLY CHALLENGE =====

export async function getWeeklyChallenge(): Promise<{ week: string; problemIds: string[]; xpBonus: number } | null> {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  const snap = await getDoc(doc(db, 'challenges', 'weekly'));
  if (!snap.exists()) return null;
  return snap.data() as any;
}

export async function getWeeklyChallengeProgress(userId: string): Promise<{ solved: number; total: number; claimed: boolean }> {
  const { firestore: db } = initializeFirebase();
  if (!db) return { solved: 0, total: 0, claimed: false };
  const weekly = await getWeeklyChallenge();
  if (!weekly) return { solved: 0, total: 0, claimed: false };
  const progressSnap = await getDoc(doc(db, 'users', userId, 'challenges', 'weekly'));
  const progressData = progressSnap.exists() ? progressSnap.data() : { solved: [] as string[] };
  const solved = (progressData.solved || []).filter((id: string) => weekly.problemIds.includes(id)).length;
  return { solved, total: weekly.problemIds.length, claimed: progressData.claimed || false };
}

export interface ChallengeProblemSummary {
  id: string;
  title: string;
  difficulty: string | null;
}

export interface DailyChallengeStatus {
  date: string;
  problemId: string;
  xpBonus: number;
  startAt: string;
  endAt: string;
  completed: boolean;
  claimed: boolean;
  problem: ChallengeProblemSummary | null;
}

export interface WeeklyChallengeStatus {
  week: string;
  problemIds: string[];
  xpBonus: number;
  startAt: string;
  endAt: string;
  solvedProblemIds: string[];
  completed: boolean;
  claimed: boolean;
  problems: ChallengeProblemSummary[];
}

export interface ChallengeStatus {
  daily: DailyChallengeStatus | null;
  weekly: WeeklyChallengeStatus | null;
  serverTime: string;
  timeZone: string;
}

export async function fetchChallengeStatus(): Promise<ChallengeStatus> {
  const { auth } = initializeFirebase();
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in to load challenges.');
  const token = await user.getIdToken();
  const response = await fetch('/api/challenges/status', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || 'Challenges are temporarily unavailable.');
  return data as ChallengeStatus;
}

export async function claimWeeklyChallengeXp(userId: string): Promise<{
  alreadyClaimed: boolean;
  xpAwarded: number;
  solved: number;
  total: number;
}> {
  const { auth } = initializeFirebase();
  const user = auth?.currentUser;
  if (!user || user.uid !== userId) throw new Error('You must be signed in to claim this reward.');
  const token = await user.getIdToken();
  const response = await fetch('/api/challenges/weekly/claim', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Unable to claim the weekly challenge reward.');
  return {
    alreadyClaimed: result.alreadyClaimed === true,
    xpAwarded: typeof result.xpAwarded === 'number' ? result.xpAwarded : 0,
    solved: typeof result.solved === 'number' ? result.solved : 0,
    total: typeof result.total === 'number' ? result.total : 0,
  };
}

// ===== STATS AGGREGATION =====

export async function getPracticeStats(userId: string) {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  const [progressSnap, submissionsSnap, problems] = await Promise.all([
    getDocs(collection(db, 'users', userId, 'practiceProgress')),
    getDocs(query(collection(db, 'users', userId, 'submissions'), orderBy('submittedAt', 'desc'), limit(500))),
    fetchProblems(),
  ]);

  const progressMap: Record<string, any> = {};
  progressSnap.docs.forEach((d: QueryDocumentSnapshot<DocumentData>) => { progressMap[d.id] = d.data(); });

  const problemsMap: Record<string, any> = {};
  problems.forEach((problem) => { problemsMap[problem.id] = problem; });

  const rawSubmissions: Record<string, any>[] = submissionsSnap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() }));
  const submissions = rawSubmissions.map(s => ({
    ...s,
    submittedAt: (s.submittedAt as any)?.toDate?.()?.toISOString() || new Date().toISOString(),
  })) as PracticeSubmission[];

  const solved = Object.values(progressMap).filter((p: any) => p.solved).length;
  const total = Object.keys(progressMap).length;

  let easySolved = 0, mediumSolved = 0, hardSolved = 0;

  for (const [pid, p] of Object.entries(progressMap)) {
    const prob = problemsMap[pid];
    if (!prob) continue;
    if ((p as any).solved) {
      if (prob.difficulty === 'Easy') easySolved++;
      else if (prob.difficulty === 'Medium') mediumSolved++;
      else if (prob.difficulty === 'Hard') hardSolved++;
    }
  }

  const byTopic: Record<string, { solved: number; total: number }> = {};
  for (const prob of Object.values(problemsMap) as any[]) {
    const topics: string[] = prob.topics || [prob.category].filter(Boolean);
    for (const t of topics) {
      if (!byTopic[t]) byTopic[t] = { solved: 0, total: 0 };
      byTopic[t].total++;
      if (progressMap[prob.id]?.solved) byTopic[t].solved++;
    }
  }

  const userSnap = await getDoc(doc(db, 'users', userId));
  const userData = userSnap.exists() ? userSnap.data() : {};

  const accepted = submissions.filter(s => s.verdict === 'Accepted').length;
  const accuracy = submissions.length > 0 ? Math.round((accepted / submissions.length) * 100) : 0;

  const last7Days: { date: string; accuracy: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayStr = d.toISOString().slice(0, 10);
    const daySubs = submissions.filter(s => {
      const ts = (s as any).submittedAt;
      return ts?.slice?.(0, 10) === dayStr;
    });
    const dayAcc = daySubs.length > 0
      ? Math.round((daySubs.filter(s => s.verdict === 'Accepted').length / daySubs.length) * 100)
      : 0;
    last7Days.push({ date: dayStr, accuracy: dayAcc });
  }

  // Compute streak from submission dates
  const submissionDates = new Set<string>();
  submissions.forEach(s => {
    const ts = (s as any).submittedAt;
    const d = ts?.slice?.(0, 10);
    if (d) submissionDates.add(d);
  });
  const sortedDates = [...submissionDates].sort().reverse();
  let streak = 0;
  const today = new Date().toISOString().slice(0, 10);
  let checkDate = new Date(today);
  for (const dateStr of sortedDates) {
    const expected = checkDate.toISOString().slice(0, 10);
    if (dateStr === expected) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else if (dateStr < expected) {
      break;
    }
  }

  return {
    totalSolved: solved,
    totalAttempted: total,
    totalXpEarned: userData.xp || 0,
    totalCoinsEarned: userData.coins || 0,
    currentStreak: streak,
    longestStreak: Math.max(streak, userData.longestStreak || 0),
    easySolved,
    mediumSolved,
    hardSolved,
    byTopic,
    recentSubmissions: submissions.slice(0, 20),
    fastestSolutions: [],
    improvement: last7Days,
    submissions,
  };
}

// ===== ACHIEVEMENTS =====

export async function checkAndAwardAchievements(userId: string, _stats: unknown) {
  const { auth } = initializeFirebase();
  if (!auth?.currentUser || auth.currentUser.uid !== userId) {
    throw new Error('Sign in to evaluate achievements.');
  }
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/achievements/evaluate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Achievement service is unavailable.');
  }
  if (!Array.isArray(data.achievements)) {
    throw new Error('Achievement service returned an invalid response.');
  }
  return data.achievements;
}

export async function getAchievements(userId: string) {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const snap = await getDocs(collection(db, 'users', userId, 'achievements'));
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() }));
}

// ===== PROGRESSIVE UNLOCKING =====

const UNLOCK_THRESHOLDS = {
  Easy: { solvesRequired: 0 },
  Medium: { solvesRequired: 10 },
  Hard: { solvesRequired: 30 },
};

export function getUnlockedDifficulties(totalSolved: number, isBeginner: boolean): ('Easy' | 'Medium' | 'Hard')[] {
  if (!isBeginner) return ['Easy', 'Medium', 'Hard'];
  const unlocked: ('Easy' | 'Medium' | 'Hard')[] = ['Easy'];
  if (totalSolved >= UNLOCK_THRESHOLDS.Medium.solvesRequired) unlocked.push('Medium');
  if (totalSolved >= UNLOCK_THRESHOLDS.Hard.solvesRequired) unlocked.push('Hard');
  return unlocked;
}

export async function getUserProblemVerdicts(userId: string): Promise<Record<string, Verdict>> {
  const { firestore: db } = initializeFirebase();
  if (!db) return {};
  const snap = await getDocs(query(
    collection(db, 'users', userId, 'submissions'),
    orderBy('submittedAt', 'desc'),
  ));
  const latest: Record<string, Verdict> = {};
  snap.docs.forEach((d: QueryDocumentSnapshot<DocumentData>) => {
    const data = d.data();
    if (!latest[data.problemId]) latest[data.problemId] = data.verdict;
  });
  return latest;
}

// ===== NEW SCHEMA: PROBLEM CONTENT (separate from metadata) =====

export async function fetchProblemContent(problemId: string): Promise<ProblemContent | null> {
  const problem = await getPublishedProblem(problemId);
  if (!problem) return null;
  return {
    description: problem.description,
    constraints: problem.constraints,
    examples: problem.examples,
    testCases: problem.testCases,
    hints: problem.hints,
    editorial: problem.editorial,
    solutionCode: {},
    starterCode: problem.starterCode,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitKb: problem.memoryLimitKb,
  } as ProblemContent;
}

export async function getFullProblem(problemId: string): Promise<PracticeProblemDocument | null> {
  return getPublishedProblem(problemId);
}

async function getPublishedProblem(problemId: string): Promise<PracticeProblemDocument | null> {
  const { auth } = initializeFirebase();
  const user = auth?.currentUser;
  if (!user) throw new Error('Sign in to open a problem.');
  const response = await fetch(`/api/problems/${encodeURIComponent(problemId)}`, {
    headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to load problem.');
  }
  return data.problem as PracticeProblemDocument;
}

// ===== DRAFTS (separate from savedCode) =====

export async function saveDraft(userId: string, draft: PracticeDraft) {
  const { firestore: db } = initializeFirebase();
  if (!db) return;
  await setDoc(doc(db, 'users', userId, 'drafts', draft.problemId), {
    code: draft.code,
    language: draft.language,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function loadDraft(userId: string, problemId: string): Promise<PracticeDraft | null> {
  const { firestore: db } = initializeFirebase();
  if (!db) return null;
  const snap = await getDoc(doc(db, 'users', userId, 'drafts', problemId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    problemId,
    code: data.code,
    language: data.language,
    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
  };
}

// ===== FILTERED QUERIES (for scalable browsing) =====

export async function fetchProblemsFiltered(opts: {
  difficulty?: string;
  topic?: string;
  isPremium?: boolean;
  search?: string;
  sortBy?: string;
  limitCount?: number;
}): Promise<ProblemDocumentMeta[]> {
  const { firestore: db } = initializeFirebase();
  if (!db) return [];
  const constraints: any[] = [];
  if (opts.difficulty && opts.difficulty !== 'All') {
    constraints.push(where('difficulty', '==', opts.difficulty));
  }
  if (opts.topic && opts.topic !== 'All') {
    constraints.push(where('topics', 'array-contains', opts.topic));
  }
  if (opts.isPremium !== undefined) {
    constraints.push(where('isPremium', '==', opts.isPremium));
  }
  constraints.push(where('isPublished', '==', true));

  const sortField = opts.sortBy === 'XP (Low)' || opts.sortBy === 'XP (High)' ? 'points'
    : opts.sortBy === 'Acceptance' ? 'acceptanceRate'
    : opts.sortBy === 'Difficulty' ? 'difficultyRating'
    : 'title';
  constraints.push(orderBy(sortField, opts.sortBy === 'XP (Low)' ? 'asc' : 'desc'));
  constraints.push(limit(opts.limitCount || 50));

  const q = query(collection(db, 'problems'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({ id: d.id, ...d.data() } as ProblemDocumentMeta));
}

// ===== BATCH PROGRESS UPDATE =====

export async function updateProgress(userId: string, problemId: string, updates: Partial<UserPracticeProgress>) {
  const { firestore: db } = initializeFirebase();
  if (!db) return;
  const ref = doc(db, 'users', userId, 'progress', problemId);
  await setDoc(ref, { ...updates, lastSubmittedAt: serverTimestamp() }, { merge: true });
}
