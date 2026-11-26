'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Target, Flame, Timer, Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import { collection, documentId, query, where } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';
import { useFirestore } from '@/firebase/provider';
import { EmptyState } from '@/components/premium/EmptyState';
import { fetchProblem } from '@/services/practice';

interface DailyChallengeConfig {
  date: string;
  problemId: string;
}

interface WeeklyChallengeConfig {
  week: string;
  problemIds: string[];
}

function getIsoWeekKey(date = new Date()): string {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - (utcDate.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utcDate.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utcDate.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export default function ChallengesPage() {
  const db = useFirestore();
  const challengeQuery = useMemo(() => {
    if (!db) return null;
    return query(
      collection(db, 'challenges'),
      where(documentId(), 'in', ['daily', 'weekly']),
    );
  }, [db]);
  const {
    data: challengeDocs, loading: challengesLoading, error: challengesError, retry: retryChallenges,
  } = useCollection(challengeQuery);
  const dailyDoc = challengeDocs?.find((item) => item.id === 'daily');
  const weeklyDoc = challengeDocs?.find((item) => item.id === 'weekly');
  const today = new Date().toISOString().slice(0, 10);
  const daily = (Array.isArray(dailyDoc?.challenges) ? dailyDoc.challenges : [])
    .find((item: DailyChallengeConfig) => item.date === today) as DailyChallengeConfig | undefined;
  const weekly = weeklyDoc?.week === getIsoWeekKey()
    && Array.isArray(weeklyDoc.problemIds)
    ? weeklyDoc as WeeklyChallengeConfig
    : null;
  const challengeIds = useMemo(
    () => [...new Set([
      ...(daily ? [daily.problemId] : []),
      ...(weekly?.problemIds ?? []),
    ])],
    [daily, weekly],
  );
  const [problemById, setProblemById] = useState<Map<string, { id: string; title: string; difficulty: string; category?: string }>>(new Map());
  const [problemsLoading, setProblemsLoading] = useState(false);
  const [problemsError, setProblemsError] = useState<Error | null>(null);
  const [problemRetryToken, setProblemRetryToken] = useState(0);

  useEffect(() => {
    let active = true;
    if (challengeIds.length === 0) {
      setProblemById(new Map());
      setProblemsError(null);
      setProblemsLoading(false);
      return () => { active = false; };
    }

    setProblemsLoading(true);
    setProblemsError(null);
    Promise.all(challengeIds.map(async (problemId) => [problemId, await fetchProblem(problemId)] as const))
      .then((entries) => {
        if (!active) return;
        setProblemById(new Map(entries.flatMap(([problemId, problem]) =>
          problem ? [[problemId, problem] as const] : [],
        )));
      })
      .catch((cause) => {
        if (active) setProblemsError(cause instanceof Error ? cause : new Error('Challenge problems are unavailable.'));
      })
      .finally(() => {
        if (active) setProblemsLoading(false);
      });

    return () => { active = false; };
  }, [challengeIds, problemRetryToken]);

  if (challengesLoading || problemsLoading) {
    return (
      <Shell>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Shell>
    );
  }

  if (challengesError || problemsError) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" />
          <h1 className="font-semibold">Challenges couldn&apos;t be loaded</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The challenge schedule or published problem list is temporarily unavailable.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            onClick={() => {
              if (challengesError) retryChallenges();
              if (problemsError) setProblemRetryToken((token) => token + 1);
            }}
          >
            Retry
          </Button>
        </div>
      </Shell>
    );
  }

  const hasActiveChallenges = Boolean(daily || (weekly && weekly.problemIds.length > 0));

  return (
    <Shell>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-headline font-bold text-foreground">Challenges</h1>
          <p className="text-muted-foreground">Current challenges configured by the platform.</p>
        </div>

        {!hasActiveChallenges ? (
          <EmptyState
            icon={Target}
            title="No Active Challenges"
            description="There are no daily or weekly challenges scheduled right now."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {daily && (
              <ChallengeCard
                title="Daily Challenge"
                subtitle={daily.date}
                icon={<Flame className="h-5 w-5 text-orange-400" />}
                problem={problemById.get(daily.problemId)}
                problemId={daily.problemId}
              />
            )}
            {weekly && weekly.problemIds.map((problemId, index) => (
              <ChallengeCard
                key={`${weekly.week}-${problemId}`}
                title={`Weekly Challenge · ${index + 1}`}
                subtitle={weekly.week}
                icon={<Timer className="h-5 w-5 text-primary" />}
                problem={problemById.get(problemId)}
                problemId={problemId}
              />
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

function ChallengeCard({
  title,
  subtitle,
  icon,
  problem,
  problemId,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  problem?: { id: string; title: string; difficulty: string; category?: string };
  problemId: string;
}) {
  return (
    <Card className="border-border bg-card/50">
      <CardContent className="flex items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5">{icon}</div>
          <div className="min-w-0 space-y-2">
            <div>
              <h2 className="font-semibold">{title}</h2>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
            {problem ? (
              <>
                <p className="truncate text-sm font-medium">{problem.title}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{problem.difficulty}</Badge>
                  {problem.category && <Badge variant="outline">{problem.category}</Badge>}
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Configured problem {problemId} is not currently published.
              </p>
            )}
          </div>
        </div>
        {problem ? (
          <Button asChild size="sm" className="shrink-0 gap-1">
            <Link href={`/practice?problem=${encodeURIComponent(problem.id)}`}>
              Solve <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled className="shrink-0">
            Unavailable
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
