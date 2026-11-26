import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifestPath = join(process.cwd(), 'data', 'problem-imports', 'exercism-python-pilot.json');
const importScript = join(process.cwd(), 'scripts', 'import-problems.mjs');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  problems: Array<{
    id: string;
    title: string;
    testCases: Array<{ isHidden: boolean }>;
    sources: Array<{ sourceId: string; license: string; revision: string }>;
  }>;
};

describe('problem import pipeline', () => {
  it('pins every imported record to a stable, MIT-licensed source and separates public and hidden tests', () => {
    expect(manifest.problems).toHaveLength(4);
    expect(new Set(manifest.problems.map((problem) => problem.id)).size).toBe(4);
    expect(new Set(manifest.problems.map((problem) =>
      problem.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(),
    )).size).toBe(4);

    for (const problem of manifest.problems) {
      expect(problem.testCases.some((testCase) => !testCase.isHidden)).toBe(true);
      expect(problem.testCases.some((testCase) => testCase.isHidden)).toBe(true);
      expect(problem.sources).toHaveLength(2);
      expect(problem.sources.every((source) => source.license === 'MIT')).toBe(true);
      expect(problem.sources.every((source) => /^[a-f0-9]{40}$/i.test(source.revision))).toBe(true);
    }
  });

  it('dry-runs without emulator credentials or writes', () => {
    const output = execFileSync(process.execPath, [
      importScript,
      '--dry-run',
      manifestPath,
    ], { cwd: process.cwd(), encoding: 'utf8' });

    expect(output).toContain('4 create candidates; no writes performed.');
    expect(output).toContain('Existing-database deduplication will be checked against the local emulator during apply.');
  });

  it('rejects duplicate normalized titles before any writes', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'devrann-problem-import-'));
    const duplicatePath = join(tempDir, 'duplicate.json');
    const duplicateManifest = {
      schemaVersion: 1,
      batchId: 'duplicate-test',
      problems: [manifest.problems[0], {
        ...manifest.problems[1],
        id: 'another-problem-id',
        title: `  ${manifest.problems[0].title.toUpperCase()}  `,
      }],
    };

    try {
      writeFileSync(duplicatePath, JSON.stringify(duplicateManifest));
      const result = spawnSync(process.execPath, [
        importScript,
        '--dry-run',
        duplicatePath,
      ], { cwd: process.cwd(), encoding: 'utf8' });

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Duplicate normalized title in batch');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
