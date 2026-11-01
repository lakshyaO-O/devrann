import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface CuratedProblem {
  id: string;
  difficulty: string;
  topics: string[];
  examples: Array<{ input: string; output: string }>;
  testCases: Array<{ input: string; expected: string; isHidden?: boolean }>;
  starterCode: Record<string, string>;
}

const problems = JSON.parse(
  readFileSync(join(process.cwd(), 'data', 'curated-problems.json'), 'utf8'),
) as CuratedProblem[];

function parseArguments(input: string): Record<string, unknown> {
  return Object.fromEntries(input.split(/,\s*(?=[a-zA-Z_$]\w*\s*=)/).map((part) => {
    const equalsIndex = part.indexOf('=');
    return [part.slice(0, equalsIndex).trim(), JSON.parse(part.slice(equalsIndex + 1).trim())];
  }));
}

function solve(problemId: string, args: Record<string, unknown>): string {
  const numbers = args.numbers as number[] | undefined;
  switch (problemId) {
    case 'distinct-values':
      return String(new Set(numbers).size);
    case 'best-fixed-window': {
      const windowSize = args.k as number;
      let sum = numbers!.slice(0, windowSize).reduce((total, value) => total + value, 0);
      let best = sum;
      for (let index = windowSize; index < numbers!.length; index++) {
        sum += numbers![index] - numbers![index - windowSize];
        best = Math.max(best, sum);
      }
      return String(best);
    }
    case 'first-unique-position': {
      const text = args.text as string;
      return String([...text].findIndex((character) => text.indexOf(character) === text.lastIndexOf(character)));
    }
    case 'shortest-threshold-window': {
      const target = args.target as number;
      let left = 0;
      let sum = 0;
      let best = numbers!.length + 1;
      for (let right = 0; right < numbers!.length; right++) {
        sum += numbers![right];
        while (sum >= target) {
          best = Math.min(best, right - left + 1);
          sum -= numbers![left++];
        }
      }
      return String(best === numbers!.length + 1 ? 0 : best);
    }
    case 'can-reach-finish': {
      let furthest = 0;
      for (let index = 0; index < numbers!.length && index <= furthest; index++) {
        furthest = Math.max(furthest, index + numbers![index]);
      }
      return String(furthest >= numbers!.length - 1);
    }
    default:
      throw new Error(`Unknown curated problem: ${problemId}`);
  }
}

describe('curated problem catalog', () => {
  it('has unique, publishable records with visible and private judge cases', () => {
    expect(new Set(problems.map((problem) => problem.id)).size).toBe(problems.length);
    for (const problem of problems) {
      expect(problem.topics.length).toBeGreaterThan(0);
      expect(problem.examples.length).toBeGreaterThan(0);
      expect(problem.testCases.filter((test) => !test.isHidden).length).toBeGreaterThan(0);
      expect(problem.testCases.filter((test) => test.isHidden).length).toBeGreaterThan(0);
      expect(Object.keys(problem.starterCode)).toEqual(expect.arrayContaining([
        'javascript', 'typescript', 'python', 'java', 'cpp',
      ]));
    }
  });

  it('matches every published sample and hidden case to its stated answer', () => {
    for (const problem of problems) {
      for (const testCase of problem.testCases) {
        expect(solve(problem.id, parseArguments(testCase.input)), `${problem.id}: ${testCase.input}`)
          .toBe(testCase.expected);
      }
    }
  });
});
