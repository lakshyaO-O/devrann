'use client';

import type { Judge, JudgeRequest, JudgeResult, JudgeProgress } from './judge';
import { initializeFirebase } from '@/firebase';

const EXECUTE_URL = '/api/judge/execute';

async function getIdToken(): Promise<string> {
  const { auth } = initializeFirebase();
  if (!auth) throw new Error('Firebase Auth not initialized');
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  return user.getIdToken();
}

async function callJudgeApi(request: JudgeRequest): Promise<JudgeResult> {
  const idToken = await getIdToken();

  const response = await fetch(EXECUTE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      code: request.code,
      language: request.language,
      testCases: request.testCases.map(tc => ({
        input: tc.input,
        expected: tc.expected || '',
        isHidden: tc.isHidden || false,
      })),
      timeLimitMs: request.timeLimitMs,
      memoryLimitKb: request.memoryLimitKb,
      problemId: request.problemId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(errorData.error || `Judge API returned ${response.status}`);
  }

  return response.json();
}

export function createApiJudge(): Judge {
  return {
    async execute(
      request: JudgeRequest,
      onProgress?: (progress: JudgeProgress) => void,
    ): Promise<JudgeResult> {
      onProgress?.({
        phase: 'compiling',
        message: 'Submitting code for execution...',
      });

      const result = await callJudgeApi(request);
      onProgress?.({
        phase: 'finished',
        message: 'Execution complete',
      });
      return result;
    },
  };
}
