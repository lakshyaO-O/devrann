import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/firebase/admin', () => ({
  getAdminFirestore: vi.fn(),
}));

async function loadJudge() {
  vi.resetModules();
  return import('@/services/judge-engine');
}

const sampleCase = [{ input: 'value=2', expected: '2' }];

describe('judge backend availability and verdicts', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns an unavailable error when no backend is configured', async () => {
    vi.stubEnv('PISTON_API_URL', '');
    vi.stubEnv('JUDGE0_API_URL', '');
    const judge = await loadJudge();

    await expect(judge.executeTestCases('function solve(value) { return value; }', 'javascript', sampleCase, 1000, 64000))
      .rejects.toMatchObject({ name: 'ExecutionBackendUnavailableError' });
  });

  it('does not turn a provider outage into a fake verdict', async () => {
    vi.stubEnv('PISTON_API_URL', 'https://judge.invalid/execute');
    vi.stubEnv('JUDGE0_API_URL', '');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('provider offline')));
    const judge = await loadJudge();

    await expect(judge.executeTestCases('function solve(value) { return value; }', 'javascript', sampleCase, 1000, 64000))
      .rejects.toMatchObject({ name: 'ExecutionBackendUnavailableError' });
  });

  it('prefers configured Judge0 over Piston and uses the Judge0 language runtime', async () => {
    vi.stubEnv('JUDGE0_API_URL', 'https://judge0.invalid/api/v1/');
    vi.stubEnv('JUDGE0_API_KEY', 'test-token');
    vi.stubEnv('PISTON_API_URL', 'https://piston.invalid/execute');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: { id: 3 },
      stdout: '2\n',
      stderr: '',
      exit_code: 0,
      time: '0.01',
      memory: 1024,
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const judge = await loadJudge();

    const result = await judge.executeTestCases(
      'function solve(value) { return value; }',
      'javascript',
      sampleCase,
      1000,
      64000,
    );

    expect(result.verdict).toBe('Accepted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://judge0.invalid/api/v1/submissions?base64_encoded=false&wait=true',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      language_id: 93,
      cpu_time_limit: 1,
      memory_limit: 64,
    });
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)['X-Auth-Token']).toBe('test-token');
  });

  it('keeps Judge0 internal errors separate from user verdicts', async () => {
    vi.stubEnv('PISTON_API_URL', '');
    vi.stubEnv('JUDGE0_API_URL', 'https://judge0.invalid/api/v1');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      status: { id: 10, description: 'Internal Error' },
    }), { status: 200 })));
    const judge = await loadJudge();

    await expect(judge.executeTestCases(
      'function solve(value) { return value; }',
      'javascript',
      sampleCase,
      1000,
      64000,
    )).rejects.toMatchObject({ name: 'ExecutionBackendInternalError' });
  });

  it('does not turn malformed provider responses into user verdicts', async () => {
    vi.stubEnv('PISTON_API_URL', '');
    vi.stubEnv('JUDGE0_API_URL', 'https://judge.invalid');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      stdout: 'provider error',
    }), { status: 200 })));
    const judge = await loadJudge();

    await expect(judge.executeTestCases('function solve(value) { return value; }', 'javascript', sampleCase, 1000, 64000))
      .rejects.toMatchObject({ name: 'ExecutionBackendUnavailableError' });
  });

  it('returns only the configured provider response as a genuine verdict', async () => {
    vi.stubEnv('PISTON_API_URL', 'https://judge.invalid/execute');
    vi.stubEnv('JUDGE0_API_URL', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      run: { stdout: '2\n', stderr: '', code: 0, time: 0.01, memory: 1024 },
    }), { status: 200 })));
    const judge = await loadJudge();

    const result = await judge.executeTestCases(
      'function solve(value) { return value; }',
      'javascript',
      sampleCase,
      1000,
      64000,
    );
    expect(result.verdict).toBe('Accepted');
    expect(result.passedTestCases).toBe(1);
    expect(result.testCaseResults[0].actualOutput).toBe('2');
  });

  it('does not include hidden test output in the response', async () => {
    vi.stubEnv('PISTON_API_URL', 'https://judge.invalid/execute');
    vi.stubEnv('JUDGE0_API_URL', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      run: { stdout: 'hidden input echoed', stderr: '', code: 0, time: 0.01, memory: 1024 },
    }), { status: 200 })));
    const judge = await loadJudge();

    const result = await judge.executeTestCases(
      'function solve(value) { return value; }',
      'javascript',
      [{ input: 'secret=hidden', expected: 'different', isHidden: true }],
      1000,
      64000,
    );

    expect(result.testCaseResults[0]).toMatchObject({
      passed: false,
      input: '',
      expectedOutput: '',
      actualOutput: '',
    });
  });
});
