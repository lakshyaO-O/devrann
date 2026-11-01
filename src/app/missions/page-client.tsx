'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2, Code2, Coins, Flame, Loader2, RefreshCw, Swords, Zap,
} from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import type { DailyMission } from '@/types';

const CATEGORY_DETAILS = {
  practice: { label: 'Practice', icon: Code2, href: '/practice' },
  arena: { label: 'Arena', icon: Swords, href: '/arena' },
} as const;

type MissionCategory = keyof typeof CATEGORY_DETAILS;

export default function MissionsPage() {
  const { user, loading: authLoading } = useUser();
  const [missions, setMissions] = useState<DailyMission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [refreshNumber, setRefreshNumber] = useState(0);
  const [filter, setFilter] = useState<'all' | MissionCategory>('all');

  useEffect(() => {
    let active = true;

    async function loadMissions() {
      if (authLoading) return;
      if (!user) {
        setMissions([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/missions/daily', {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Unable to load daily missions.');
        if (active) setMissions(result.missions as DailyMission[]);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load daily missions.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadMissions();
    return () => { active = false; };
  }, [user, authLoading, refreshNumber]);

  const claimReward = useCallback(async (mission: DailyMission) => {
    if (!user || claimingId) return;
    setClaimingId(mission.id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/missions/daily', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ missionId: mission.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to claim mission reward.');
      setMissions((current) => current.map((item) =>
        item.id === mission.id ? { ...item, claimed: true } : item,
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to claim mission reward.');
    } finally {
      setClaimingId(null);
    }
  }, [user, claimingId]);

  const visibleMissions = missions.filter((mission) =>
    filter === 'all' || mission.type === filter,
  );
  const completedCount = missions.filter((mission) => mission.completed).length;

  return (
    <Shell>
      <div className="space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-4xl font-headline font-bold text-foreground">Daily Missions</h1>
            <p className="text-muted-foreground">
              Progress is counted from accepted submissions and completed Arena matches recorded by DevRann.
            </p>
          </div>
          {!loading && missions.length > 0 && (
            <Badge variant="outline">{completedCount} of {missions.length} completed</Badge>
          )}
        </div>

        {error && (
          <Card role="alert" className="border-destructive/40">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setRefreshNumber((n) => n + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {authLoading || loading ? (
          <div className="flex min-h-60 items-center justify-center" aria-label="Loading daily missions">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !user ? (
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <Flame className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="font-semibold">Sign in to view your missions</h2>
              <p className="text-sm text-muted-foreground">Missions are tied to your verified account activity.</p>
              <Button asChild><Link href="/auth">Sign in</Link></Button>
            </CardContent>
          </Card>
        ) : missions.length === 0 && !error ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No daily missions are available right now.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" aria-label="Filter missions">
              {(['all', 'practice', 'arena'] as const).map((category) => (
                <Button
                  key={category}
                  variant={filter === category ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(category)}
                >
                  {category === 'all' ? 'All' : CATEGORY_DETAILS[category].label}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {visibleMissions.map((mission) => {
                const category = CATEGORY_DETAILS[mission.type as MissionCategory];
                if (!category) return null;
                const Icon = category.icon;
                const progressValue = Math.min(100, (mission.progress / mission.requirement) * 100);

                return (
                  <Card key={mission.id} className={mission.completed ? 'border-emerald-500/30' : undefined}>
                    <CardContent className="flex h-full flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
                            <Icon className="h-5 w-5 text-primary" />
                          </span>
                          <div>
                            <p className="text-xs text-muted-foreground">{category.label}</p>
                            <h2 className="font-semibold">{mission.title}</h2>
                          </div>
                        </div>
                        {mission.completed && (
                          <Badge variant="outline" className="text-emerald-500">
                            <CheckCircle2 className="mr-1 h-3 w-3" /> Complete
                          </Badge>
                        )}
                      </div>

                      <p className="mt-3 flex-1 text-sm text-muted-foreground">{mission.description}</p>
                      <div className="mt-4 space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Verified progress</span>
                          <span>{mission.progress}/{mission.requirement}</span>
                        </div>
                        <Progress value={progressValue} />
                      </div>

                      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-primary" /> {mission.xpReward} XP</span>
                          <span className="flex items-center gap-1"><Coins className="h-3 w-3 text-yellow-500" /> {mission.coinReward}</span>
                        </div>
                        {mission.claimed ? (
                          <Badge variant="secondary">Claimed</Badge>
                        ) : mission.completed ? (
                          <Button size="sm" onClick={() => void claimReward(mission)} disabled={claimingId !== null}>
                            {claimingId === mission.id && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                            Claim reward
                          </Button>
                        ) : (
                          <Button asChild size="sm" variant="outline">
                            <Link href={category.href}>Continue</Link>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}
