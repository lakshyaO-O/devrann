import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'codexarena-4990f';
const cfgPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const tokens = cfg.tokens || {};

async function post(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${url} -> ${res.status} non-JSON (${text.slice(0, 200)})`);
  }
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

let access = tokens.access_token;
const expiresAt = tokens.expires_at ? (tokens.expires_at > 1e12 ? tokens.expires_at : tokens.expires_at * 1000) : 0;
const expired = !expiresAt || Date.now() > expiresAt - 60_000;
if (!access || expired) {
  if (!tokens.refresh_token) throw new Error('no refresh token stored for firebase-tools');
  const t = await post('https://oauth2.googleapis.com/token', {
    refresh_token: tokens.refresh_token,
    client_id: process.env.FB_CLIENT_ID || '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    grant_type: 'refresh_token',
  });
  access = t.access_token;
  tokens.access_token = access;
  tokens.expires_at = Date.now() + (t.expires_in || 3600) * 1000;
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
}

const outDir = path.join(process.cwd(), 'docs', 'deploy-backup');
fs.mkdirSync(outDir, { recursive: true });

const releasesRes = await fetch(
  `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`,
  { headers: { Authorization: `Bearer ${access}` } }
);
const releasesBody = await releasesRes.json();
if (!releasesRes.ok) throw new Error(`releases fetch -> ${releasesRes.status} ${JSON.stringify(releasesBody)}`);
const release =
  (releasesBody.releases || []).find((r) => r.name.endsWith('/cloud.firestore')) ||
  (releasesBody.releases || [])[0];
const rulesFile = path.join(outDir, 'firestore.rules.deployed.txt');
let deployedSource = '';
if (release && release.rulesetName) {
  const rsRes = await fetch(
    `https://firebaserules.googleapis.com/v1/${release.rulesetName}`,
    { headers: { Authorization: `Bearer ${access}` } }
  );
  const rsBody = await rsRes.json();
  if (rsRes.ok) {
    deployedSource = (rsBody.source?.files || []).map((f) => `// file: ${f.name}\n${f.content}`).join('\n');
    fs.writeFileSync(rulesFile, deployedSource);
  } else {
    console.log('ruleset fetch failed:', rsRes.status, JSON.stringify(rsBody).slice(0, 200));
  }
}

const idxFile = path.join(outDir, 'firestore.indexes.deployed.json');
let deployedIndexes = null;
try {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync(
    process.platform === 'win32' ? 'node_modules\\.bin\\firebase.cmd' : 'node_modules/.bin/firebase',
    ['firestore:indexes', '--project', PROJECT, '--json', '--non-interactive'],
    { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, shell: process.platform === 'win32' }
  );
  fs.writeFileSync(idxFile, out);
  deployedIndexes = out;
} catch (e) {
  console.log('indexes listing failed:', String(e.message || e).slice(0, 300));
}

const localSource = fs.readFileSync('firestore.rules', 'utf8');
console.log('project:', PROJECT);
console.log('release:', release ? release.name : 'none', release ? release.updateTime : '');
console.log('deployed rules bytes:', deployedSource.length, 'local rules bytes:', localSource.length);
console.log('rules identical:', deployedSource.trim() === localSource.trim());
console.log('rules backup:', rulesFile);
console.log('indexes backup:', idxFile, 'written:', Boolean(deployedIndexes));
if (deployedIndexes) {
  try {
    const parsed = JSON.parse(deployedIndexes);
    const list = parsed.result?.indexes || parsed.indexes || [];
    console.log('deployed composite index count:', list.length);
    const local = JSON.parse(fs.readFileSync('firestore.indexes.json', 'utf8'));
    const localList = local.indexes || [];
    console.log('local composite index count:', localList.length);
    const key = (i) =>
      (i.collectionGroup || '') +
      '|' +
      (i.queryScope || '') +
      '|' +
      (i.fields || [])
        .filter((f) => f.fieldPath !== '__name__')
        .map((f) => `${f.fieldPath}:${f.order || f.arrayConfig || ''}`)
        .join(',');
    const dep = new Set(list.map(key));
    const loc = new Set(localList.map(key));
    const missing = [...loc].filter((k) => !dep.has(k));
    const extra = [...dep].filter((k) => !loc.has(k));
    console.log('local indexes not yet deployed:', missing.length);
    missing.forEach((m) => console.log('  +', m));
    console.log('deployed indexes not in local file:', extra.length);
    extra.forEach((m) => console.log('  -', m));
  } catch (e) {
    console.log('index compare failed:', String(e.message || e).slice(0, 200));
  }
}
