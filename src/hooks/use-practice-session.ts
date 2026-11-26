'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { CodingLanguage, PracticeProblemDocument, TestCaseResult, Verdict, SubmissionStatus, ExecutionPhase } from '@/types';
import { runPublicTests, submitSolution } from '@/services/practice';
import type { JudgeProgress } from '@/features/practice/services/judge';

interface SessionState {
  code: string;
  language: CodingLanguage;
  isRunning: boolean;
  isSubmitting: boolean;
  submissionStatus: SubmissionStatus;
  testResults: TestCaseResult[];
  verdict: Verdict | null;
  passedTestCases: number;
  totalTestCases: number;
  executionTimeMs: number;
  memoryUsedKb: number;
  compileTimeMs: number;
  codeSize: number;
  phase: ExecutionPhase;
  currentTest: number;
  totalTests: number;
  phaseMessage: string;
  error: string | null;
}

export function usePracticeSession(
  userId: string | null,
  username: string,
  problem: PracticeProblemDocument | null,
) {
  const [state, setState] = useState<SessionState>({
    code: '',
    language: 'javascript',
    isRunning: false,
    isSubmitting: false,
    submissionStatus: 'pending',
    testResults: [],
    verdict: null,
    passedTestCases: 0,
    totalTestCases: 0,
    executionTimeMs: 0,
    memoryUsedKb: 0,
    compileTimeMs: 0,
    codeSize: 0,
    phase: 'idle',
    currentTest: 0,
    totalTests: 0,
    phaseMessage: '',
    error: null,
  });

  const prevProblemRef = useRef<string | null>(null);
  const languageRef = useRef<CodingLanguage>(state.language);
  const codeRef = useRef<string>(state.code);

  useEffect(() => {
    if (!problem || prevProblemRef.current === problem.id) return;
    prevProblemRef.current = problem.id;
    const availableLanguages = Object.keys(problem.starterCode) as CodingLanguage[];
    const language = availableLanguages.includes(state.language)
      ? state.language
      : availableLanguages[0] ?? state.language;
    const starter = problem.starterCode[language] || '';
    setState(s => ({
      ...s,
      language,
      code: starter,
      testResults: [],
      verdict: null,
      phase: 'idle',
      error: null,
    }));
  }, [problem, state.language]);

  useEffect(() => { languageRef.current = state.language; }, [state.language]);
  useEffect(() => { codeRef.current = state.code; }, [state.code]);

  const setCode = useCallback((code: string) => {
    codeRef.current = code;
    setState(s => ({ ...s, code }));
  }, []);

  const setLanguage = useCallback((language: CodingLanguage) => {
    setState(s => ({
      ...s,
      language,
      code: problem?.starterCode[language] || '',
    }));
  }, [problem]);

  const handleProgress = useCallback((progress: JudgeProgress) => {
    setState(s => ({
      ...s,
      phase: progress.phase,
      currentTest: progress.current ?? s.currentTest,
      totalTests: progress.total ?? s.totalTests,
      phaseMessage: progress.message ?? s.phaseMessage,
    }));
  }, []);

  const runTests = useCallback(async () => {
    if (!problem || !userId) return;
    setState(s => ({
      ...s,
      isRunning: true,
      testResults: [],
      verdict: null,
      phase: 'compiling',
      currentTest: 0,
      totalTests: 0,
      phaseMessage: 'Running sample tests...',
      error: null,
    }));

    try {
      const result = await runPublicTests(
        problem.id,
        languageRef.current,
        codeRef.current,
        problem.testCases,
        problem.timeLimitMs,
        problem.memoryLimitKb,
      );
      setState(s => ({
        ...s,
        isRunning: false,
        testResults: result.testCaseResults,
        passedTestCases: result.testCaseResults.filter(r => r.passed).length,
        totalTestCases: result.testCaseResults.length,
        executionTimeMs: result.executionTimeMs,
        memoryUsedKb: result.memoryUsedKb,
        compileTimeMs: result.compileTimeMs,
        codeSize: result.codeSize,
        phase: 'finished',
        phaseMessage: 'Sample run complete',
      }));
    } catch (cause) {
      setState(s => ({
        ...s,
        isRunning: false,
        phase: 'error',
        phaseMessage: 'Sample run failed',
        error: cause instanceof Error ? cause.message : 'Sample test execution failed.',
      }));
    }
  }, [problem, userId]);

  const submit = useCallback(async () => {
    if (!problem || !userId) return;
    setState(s => ({
      ...s,
      isSubmitting: true,
      submissionStatus: 'running',
      testResults: [],
      verdict: null,
      phase: 'compiling',
      currentTest: 0,
      totalTests: 0,
      phaseMessage: 'Submitting for full evaluation...',
      error: null,
    }));

    try {
      const { submission, results, compileTimeMs, codeSize } = await submitSolution(
        userId,
        username,
        problem.id,
        languageRef.current,
        codeRef.current,
        undefined,
        handleProgress,
      );
      setState(s => ({
        ...s,
        isSubmitting: false,
        submissionStatus: 'completed',
        testResults: results,
        verdict: submission.verdict,
        passedTestCases: submission.passedTestCases,
        totalTestCases: submission.totalTestCases,
        executionTimeMs: submission.executionTimeMs,
        memoryUsedKb: submission.memoryUsedKb,
        compileTimeMs: compileTimeMs ?? 0,
        codeSize: codeSize ?? 0,
        phase: 'finished',
        currentTest: results.length,
        phaseMessage: submission.verdict === 'Accepted' ? 'Accepted' : 'Failed',
      }));
      return submission;
    } catch (cause) {
      setState(s => ({
        ...s,
        isSubmitting: false,
        submissionStatus: 'pending',
        phase: 'error',
        phaseMessage: 'Submission failed',
        error: cause instanceof Error ? cause.message : 'Code submission failed.',
      }));
      return undefined;
    }
  }, [problem, userId, username, handleProgress]);

  const resetCode = useCallback(() => {
    if (!problem) return;
    setState(s => ({
      ...s,
      code: problem.starterCode[s.language] || problem.starterCode.javascript || '',
      testResults: [],
      verdict: null,
      phase: 'idle',
      currentTest: 0,
      totalTests: 0,
      phaseMessage: '',
      error: null,
    }));
  }, [problem]);

  return {
    ...state,
    setCode,
    setLanguage,
    runTests,
    submit,
    resetCode,
  };
}
