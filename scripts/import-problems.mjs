import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';

const allowedLicenses = new Set(['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC-BY-4.0']);

const sourceSchema = z.object({
  sourceId: z.string().min(1),
  provider: z.string().min(1),
  repository: z.string().min(1),
  path: z.string().min(1),
  revision: z.string().regex(/^[a-f0-9]{40}$/i),
  url: z.string().url(),
  attribution: z.string().min(1),
  license: z.string().min(1),
  licenseUrl: z.string().url(),
});

const testCaseSchema = z.object({
  input: z.string().min(1),
  expected: z.string(),
  isHidden: z.boolean(),
});

const problemSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(160),
  difficulty: z.enum(['Easy', 'Medium', 'Hard']),
  category: z.string().trim().min(1).max(80),
  points: z.number().int().positive(),
  estimatedTime: z.number().int().positive(),
  topics: z.array(z.string().trim().min(1)).min(1),
  description: z.string().trim().min(1),
  constraints: z.array(z.string()),
  examples: z.array(z.object({
    input: z.string(),
    output: z.string(),
    explanation: z.string().optional(),
  })).min(1),
  hints: z.array(z.string()),
  editorial: z.string(),
  starterCode: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length > 0),
  timeLimitMs: z.number().int().positive(),
  memoryLimitKb: z.number().int().positive(),
  testCases: z.array(testCaseSchema).min(2),
  sources: z.array(sourceSchema).min(1),
});

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  batchId: z.string().min(1),
  problems: z.array(problemSchema).min(1),
});

function normalizeTitle(title) {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function parseArgs(args) {
  const options = { mode: 'dry-run', publish: false, checkExisting: false, manifestPath: null };
  for (const arg of args) {
    if (arg === '--dry-run') options.mode = 'dry-run';
    else if (arg === '--apply') options.mode = 'apply';
    else if (arg === '--publish') options.publish = true;
    else if (arg === '--check-existing') options.checkExisting = true;
    else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (options.manifestPath) throw new Error('Provide exactly one manifest path.');
    else options.manifestPath = arg;
  }
  if (!options.manifestPath) throw new Error('A manifest path is required.');
  if (options.publish && options.mode !== 'apply') {
    throw new Error('--publish requires --apply.');
  }
  if (options.checkExisting && options.mode !== 'dry-run') {
    throw new Error('--check-existing is only valid with --dry-run.');
  }
  return options;
}

function validateBatch(input) {
  const manifest = manifestSchema.parse(input);
  const ids = new Set();
  const sourceIds = new Set();
  const titles = new Set();

  for (const problem of manifest.problems) {
    const normalizedTitle = normalizeTitle(problem.title);
    if (ids.has(problem.id)) throw new Error(`Duplicate problem ID in batch: ${problem.id}`);
    if (titles.has(normalizedTitle)) throw new Error(`Duplicate normalized title in batch: ${problem.title}`);
    ids.add(problem.id);
    titles.add(normalizedTitle);

    if (!problem.testCases.some((testCase) => !testCase.isHidden)
      || !problem.testCases.some((testCase) => testCase.isHidden)) {
      throw new Error(`${problem.id} must include public and hidden test cases.`);
    }

    for (const source of problem.sources) {
      if (!allowedLicenses.has(source.license)) {
        throw new Error(`${problem.id} has a non-approved license: ${source.license}`);
      }
      if (sourceIds.has(source.sourceId)) {
        throw new Error(`Duplicate stable source ID in batch: ${source.sourceId}`);
      }
      sourceIds.add(source.sourceId);
    }
  }

  return manifest;
}

function assertLocalEmulator() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  if (!['127.0.0.1:8080', 'localhost:8080'].includes(emulatorHost ?? '')) {
    throw new Error('Firestore access is restricted to the local emulator at 127.0.0.1:8080.');
  }
  const projectId = process.env.GCLOUD_PROJECT;
  if (projectId !== 'demo-devrann-p1') {
    throw new Error('Firestore access requires the demo-devrann-p1 emulator project.');
  }
}

async function getLocalFirestore() {
  assertLocalEmulator();
  const { initializeApp, getApps } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps().find((candidate) => candidate.options.projectId === 'demo-devrann-p1')
    ?? initializeApp({ projectId: 'demo-devrann-p1' }, 'devrann-problem-import-emulator');
  return getFirestore(app);
}

async function getExistingProblemData(db) {
  const snapshot = await db.collection('problems').get();
  const ids = new Set();
  const titles = new Set();
  const sources = new Set();
  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    ids.add(doc.id);
    if (typeof data.title === 'string') titles.add(normalizeTitle(data.title));
    if (Array.isArray(data.sources)) {
      data.sources.forEach((source) => {
        if (typeof source?.sourceId === 'string') sources.add(source.sourceId);
      });
    }
  });
  return { ids, titles, sources };
}

function findConflict(problem, existing) {
  if (existing.ids.has(problem.id)) return `problem ID already exists (${problem.id})`;
  if (existing.titles.has(normalizeTitle(problem.title))) return `normalized title already exists (${problem.title})`;
  const existingSource = problem.sources.find((source) => existing.sources.has(source.sourceId));
  if (existingSource) return `stable source ID already exists (${existingSource.sourceId})`;
  return null;
}

function toFirestoreDocuments(problem, isPublished, batchId) {
  const publicTestCases = problem.testCases.filter((testCase) => !testCase.isHidden);
  const sourceKeys = problem.sources.map((source) => source.sourceId);
  const meta = {
    title: problem.title,
    titleLower: normalizeTitle(problem.title),
    slug: problem.id,
    difficulty: problem.difficulty,
    category: problem.category,
    points: problem.points,
    estimatedTime: problem.estimatedTime,
    topics: problem.topics,
    isPremium: false,
    isPublished,
    sources: problem.sources,
    sourceKeys,
    importBatchId: batchId,
    normalizedTitle: normalizeTitle(problem.title),
  };
  const content = {
    description: problem.description,
    constraints: problem.constraints,
    examples: problem.examples,
    hints: problem.hints,
    editorial: problem.editorial,
    starterCode: problem.starterCode,
    timeLimitMs: problem.timeLimitMs,
    memoryLimitKb: problem.memoryLimitKb,
    testCases: publicTestCases,
  };
  const secrets = {
    testCases: problem.testCases,
  };
  return { meta, content, secrets };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(process.cwd(), options.manifestPath);
  const input = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifest = validateBatch(input);
  let db = null;
  let existing = { ids: new Set(), titles: new Set(), sources: new Set() };

  if (options.mode === 'apply' || options.checkExisting) {
    db = await getLocalFirestore();
    existing = await getExistingProblemData(db);
  }

  const ready = [];
  for (const problem of manifest.problems) {
    const conflict = findConflict(problem, existing);
    if (conflict) {
      console.log(`SKIP ${problem.id}: ${conflict}`);
    } else {
      ready.push(problem);
      console.log(`${options.mode === 'apply' ? 'CREATE' : 'WOULD CREATE'} ${problem.id}: ${problem.title}`);
      if (options.mode === 'apply') {
        existing.ids.add(problem.id);
        existing.titles.add(normalizeTitle(problem.title));
        problem.sources.forEach((source) => existing.sources.add(source.sourceId));
      }
    }
  }

  if (options.mode === 'dry-run') {
    console.log(`Dry run complete: ${ready.length} create candidates; no writes performed.`);
    if (!options.checkExisting) {
      console.log('Existing-database deduplication will be checked against the local emulator during apply.');
    }
    return;
  }

  for (const problem of ready) {
    const refs = {
      meta: db.collection('problems').doc(problem.id),
      content: db.collection('problemContent').doc(problem.id),
      secrets: db.collection('problemSecrets').doc(problem.id),
      sourceKeys: problem.sources.map((source) => db.collection('problemImportSources')
        .doc(sha256(source.sourceId))),
    };
    const documents = toFirestoreDocuments(problem, options.publish, manifest.batchId);
    await db.runTransaction(async (transaction) => {
      const [metaSnap, contentSnap, secretsSnap, ...sourceSnaps] = await Promise.all([
        transaction.get(refs.meta),
        transaction.get(refs.content),
        transaction.get(refs.secrets),
        ...refs.sourceKeys.map((ref) => transaction.get(ref)),
      ]);
      if (metaSnap.exists || contentSnap.exists || secretsSnap.exists || sourceSnaps.some((snap) => snap.exists)) {
        throw new Error(`Refusing to overwrite an existing problem record: ${problem.id}`);
      }
      transaction.create(refs.meta, documents.meta);
      transaction.create(refs.content, documents.content);
      transaction.create(refs.secrets, documents.secrets);
      refs.sourceKeys.forEach((ref, index) => transaction.create(ref, {
        problemId: problem.id,
        sourceId: problem.sources[index].sourceId,
      }));
    });
  }

  const published = await db.collection('problems')
    .where('isPublished', '==', true)
    .count()
    .get();
  console.log(`Import complete: ${ready.length} created; published problem count in local emulator: ${published.data().count}.`);
}

main().catch((error) => {
  console.error(`[Problem Import] ${error instanceof Error ? error.message : 'Import failed.'}`);
  process.exitCode = 1;
});
