'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertCircle, CheckCircle2, Gift, Loader2, Target, Trophy,
} from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import { useWeeklyChallenge } from '@/hooks/use-daily-challenge';

function formatUtcRange(startAt: string, endAt: string) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  return `${start.toISOString().slice(0, 16).replace('T', ' ')} UTC to ${end.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export default function WeeklyChallengesPage() {
  const { user, loading: authLoading } = useUser();
  const { weekly, progress, problems, loading, error, claim, retry } = useWeeklyChallenge(user?.uid || null);
  const [claiming, setClaiming] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  const handleClaim = async () => {
    setClaiming(true);
    setClaimMessage(null);
    try {
      const result = await claim();
      if (!result) return;
      setClaimMessage(
        result.xpAwarded > 0
          ? `Claimed ${result.xpAwarded} XP.`
          : result.alreadyClaimed
            ? 'This weekly reward was already claimed.'
            : 'Reward claim completed.',
      );
    } catch (cause) {
      setClaimMessage(cause instanceof Error ? cause.message : 'Unable to claim the weekly reward.');
    } finally {
      setClaiming(false);
    }
  };

  const percent = progress.total > 0 ? Math.round((progress.solved / progress.total) * 100) : 0;

  return (
    <Shell>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-headline font-bold text-foreground">
            Weekly <span className="text-primary">Challenges</span>
          </h1>
          <p className="text-muted-foreground">
            One verified challenge per ISO week. Progress is computed from accepted submissions only.
          </p>
        </div>

        {authLoading || loading ? (
          <div className="flex justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !user ? (
          <Card className="border-border bg-card/50">
            <CardContent className="py-16 text-center">
              <Target className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h2 className="font-semibold">Sign in to view weekly challenges</h2>
              <p className="mt-2 text-sm text-muted-foreground">Completion requires a verified accepted submission.</p>
            </CardContent>
          </Card>
        ) : error ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="py-12 text-center">
              <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" />
              <h2 className="font-semibold">Weekly challenge couldn&apos;t be loaded</h2>
              <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
              <Button variant="outline" className="mt-4" onClick={retry}>Retry</Button>
            </CardContent>
          </Card>
        ) : !weekly ? (
          <Card className="border-border bg-card/50">
            <CardContent className="py-16 text-center">
              <Trophy className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <h2 className="font-semibold">No active weekly challenge</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                No weekly challenge has been scheduled for {new Date().toISOString().slice(0, 10)} UTC.
                A challenge appears here only after an admin publishes one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <CardTitle className="text-lg font-headline font-bold">Week {weekly.week}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[11px]">{formatUtcRange(weekly.startAt ?? new Date().toISOString(), weekly.endAt ?? new Date().toISOString())}</Badge>
                    <Badge className="bg-primary/15 text-primary">
                      <Gift className="mr-1 h-3 w-3" /> {weekly.xpBonus} XP
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Solved</span>
                  <span className="font-bold">{progress.solved} / {progress.total}</span>
                </div>
                <Progress value={percent} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleClaim}
                    disabled={claiming || progress.claimed || progress.solved < progress.total}
                  >
                    {claiming ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Gift className="mr-1 h-4 w-4" />}
                    {progress.claimed ? 'Reward claimed' : 'Claim weekly reward'}
                  </Button>
                  {progress.solved < progress.total && (
                    <span className="text-xs text-muted-foreground">
                      Solve all {progress.total} problems to unlock the reward.
                    </span>
                  )}
                  {claimMessage && <span className="text-xs text-muted-foreground">{claimMessage}</span>}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-3">
              <h2 className="font-headline font-bold">Problems</h2>
              {problems.length === 0 ? (
                <Card className="border-border bg-card/50">
                  <CardContent className="py-10 text-center text-sm text-muted-foreground">
                    The scheduled challenge problems are not currently published.
                  </CardContent>
                </Card>
              ) : (
                problems.map((problem) => {
                  const solved = progress.solvedProblemIds.includes(problem.id);
                  return (
                    <Card key={problem.id} className="border-border bg-card/50">
                      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="flex items-center gap-3">
                          {solved ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                          ) : (
                            <Target className="h-5 w-5 text-muted-foreground" />
                          )}
                          <div>
                            <p className="font-semibold">{problem.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {problem.difficulty ?? 'Unrated'} Â· {problem.id}
                            </p>
                          </div>
                        </div>
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/practice?problem=${encodeURIComponent(problem.id)}`}>
                            {solved ? 'Review' : 'Solve'}
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
