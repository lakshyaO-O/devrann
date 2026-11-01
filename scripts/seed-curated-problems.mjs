#!/usr/bin/env node
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apply = process.argv.includes('--apply');
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: resolve(repositoryRoot, '.env.local'), quiet: true });
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const catalogPath = resolve(repositoryRoot, 'data/curated-problems.json');
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));

for (const problem of catalog) {
  if (!problem.id || !problem.title || !Array.isArray(problem.testCases) || problem.testCases.length < 2) {
    throw new Error(`Invalid curated problem record: ${problem.id || '(missing id)'}`);
  }
  if (!Object.hasOwn(problem.starterCode, 'javascript') || !problem.testCases.every(test => test.input && test.expected !== undefined)) {
    throw new Error(`Problem ${problem.id} is missing starter code or valid judge cases.`);
  }
}

console.log(`Curated starter catalog: ${catalog.length} original problems, ${catalog.reduce((n, p) => n + p.testCases.length, 0)} judge cases.`);
console.log(`Target Firebase project: ${projectId || '(not set)'}`);

if (!apply) {
  console.log('Dry run only. Set GOOGLE_APPLICATION_CREDENTIALS and FIREBASE_PROJECT_ID, then rerun with --apply to import.');
  process.exit(0);
}

if (!projectId) {
  throw new Error('Set FIREBASE_PROJECT_ID (or NEXT_PUBLIC_FIREBASE_PROJECT_ID) before applying.');
}

const privateKey = process.env.FIREBASE_PRIVATE_KEY;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const credential = privateKey && clientEmail
  ? cert({ projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') })
  : applicationDefault();
initializeApp({ credential, projectId });
const db = getFirestore();
const batch = db.batch();
const skipped = [];
let imported = 0;

for (const problem of catalog) {
  const refs = {
    meta: db.collection('problems').doc(problem.id),
    content: db.collection('problemContent').doc(problem.id),
    secrets: db.collection('problemSecrets').doc(problem.id),
  };
  const existing = await Promise.all(Object.values(refs).map(ref => ref.get()));
  if (existing.some(snapshot => snapshot.exists)) {
    skipped.push(problem.id);
    continue;
  }

  const visibleCases = problem.testCases.filter(test => test.isHidden !== true);
  const titleTokens = `${problem.title} ${problem.category} ${problem.topics.join(' ')}`.toLowerCase().split(/\s+/);

  batch.create(refs.meta, {
    title: problem.title,
    difficulty: problem.difficulty,
    category: problem.category,
    points: problem.points,
    topics: problem.topics,
    companyTags: [],
    isPublished: true,
    isPremium: false,
    isArchived: false,
    estimatedTime: problem.estimatedTime,
    difficultyRating: problem.difficulty === 'Easy' ? 1 : problem.difficulty === 'Medium' ? 2 : 3,
    prerequisites: [],
    relatedProblems: [],
    searchTokens: [...new Set(titleTokens)],
    totalSubmissions: 0,
    totalAccepted: 0,
    acceptanceRate: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    source: 'devrann-curated-v1',
  });
  batch.create(refs.content, {
    description: problem.description,
    constraints: problem.constraints,
    examples: problem.examples,
    testCases: visibleCases,
    hints: problem.hints,
    editorial: problem.editorial,
    solutionCode: {},
    starterCode: problem.starterCode,
    timeLimitMs: 2000,
    memoryLimitKb: 256000,
  });
  batch.create(refs.secrets, {
    testCases: problem.testCases,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    source: 'devrann-curated-v1',
  });
  imported++;
}

if (imported > 0) await batch.commit();
console.log(`Imported ${imported} problems; left ${skipped.length} existing records untouched.`);
if (skipped.length > 0) console.log(`Skipped existing IDs: ${skipped.join(', ')}`);
