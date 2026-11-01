'use client';

import Link from 'next/link';
import { ArrowRight, CalendarDays, Code2, Trophy, Users } from 'lucide-react';
import type { PublicOverview } from './public-overview';

interface FeaturesSectionProps {
  overview: PublicOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function PanelSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="animate-pulse divide-y divide-border" aria-label="Loading live platform data">
      {Array.from({ length: rows }, (_, index) => (
        <div className="flex items-center gap-3 px-4 py-3" key={index}>
          <div className="h-8 w-8 rounded-md bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="h-2.5 w-1/3 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-5 text-sm text-muted-foreground">{children}</p>;
}

export function FeaturesSection({ overview, loading, error, onRetry }: FeaturesSectionProps) {
  return (
    <section className="border-b border-border bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">Live platform data</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">A place to practice and compete</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Counts and listings come from published problems, registered accounts, public ratings, and scheduled contests.
            </p>
          </div>
          {error && (
            <button type="button" onClick={onRetry} className="rounded-md border border-border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-muted">
              Retry loading live data
            </button>
          )}
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-5 text-sm text-muted-foreground" role="alert">
            Live platform data is temporarily unavailable. Please try again.
          </div>
        ) : (
          <>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">Registered accounts</p>
                {loading || !overview ? (
                  <div className="mt-2 h-6 w-20 animate-pulse rounded bg-muted" />
                ) : (
                  <p className="mt-1 text-xl font-semibold tabular-nums">{overview.registeredUsers.toLocaleString()}</p>
                )}
              </div>
              <div className="rounded-lg border border-border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">Published problems</p>
                {loading || !overview ? (
                  <div className="mt-2 h-6 w-20 animate-pulse rounded bg-muted" />
                ) : (
                  <p className="mt-1 text-xl font-semibold tabular-nums">{overview.publishedProblems.toLocaleString()}</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.25fr_0.85fr_0.9fr]">
              <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="available-problems-heading">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h3 id="available-problems-heading" className="flex items-center gap-2 text-sm font-semibold"><Code2 className="h-4 w-4 text-primary" /> Available problems</h3>
                  <Link href="/problems" className="text-xs text-muted-foreground transition-colors hover:text-foreground">Browse all</Link>
                </div>
                {loading ? <PanelSkeleton /> : overview?.problems.length ? (
                  <div className="divide-y divide-border">
                    {overview.problems.map((problem) => (
                      <Link href={`/practice?problem=${encodeURIComponent(problem.id)}`} key={problem.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                          <Code2 className="h-4 w-4 text-muted-foreground" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{problem.title}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{problem.category || 'Published challenge'}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">{problem.difficulty || 'Unrated'}</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyPanel>No problems have been published yet.</EmptyPanel>
                )}
                <Link href="/practice" className="flex items-center justify-between border-t border-border px-4 py-3 text-xs font-medium text-primary transition-colors hover:bg-muted/40">
                  Go to practice <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </section>

              <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="public-ratings-heading">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h3 id="public-ratings-heading" className="flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" /> Public ratings</h3>
                  <span className="text-[11px] text-muted-foreground">Opted in</span>
                </div>
                {loading ? <PanelSkeleton /> : overview?.leaderboard.length ? (
                  <div className="divide-y divide-border">
                    {overview.leaderboard.map((player, index) => (
                      <Link href={`/u/${encodeURIComponent(player.username)}`} key={player.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                        <span className="w-5 font-mono text-xs text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{player.username}</span>
                        <span className="font-mono text-xs text-muted-foreground">{player.rating.toLocaleString()} <span className="text-[10px]">ELO</span></span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyPanel>No players have chosen to show their rating publicly.</EmptyPanel>
                )}
                <Link href="/leaderboard" className="flex items-center justify-between border-t border-border px-4 py-3 text-xs font-medium text-primary transition-colors hover:bg-muted/40">
                  View leaderboard <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </section>

              <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="scheduled-contests-heading">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h3 id="scheduled-contests-heading" className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" /> Scheduled contests</h3>
                  <Link href="/contests" className="text-xs text-muted-foreground transition-colors hover:text-foreground">All contests</Link>
                </div>
                {loading ? <PanelSkeleton rows={2} /> : overview?.contests.length ? (
                  <div className="divide-y divide-border">
                    {overview.contests.map((contest) => (
                      <div key={contest.id} className="px-4 py-3">
                        <p className="truncate text-sm font-medium">{contest.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(contest.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyPanel>No upcoming contests are scheduled.</EmptyPanel>
                )}
                <Link href="/contests" className="flex items-center justify-between border-t border-border px-4 py-3 text-xs font-medium text-primary transition-colors hover:bg-muted/40">
                  Explore contests <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </section>
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
              <Users className="h-4 w-4 shrink-0 text-primary" />
              Community and rating details appear only when their owners have made them public.
            </div>
          </>
        )}
      </div>
    </section>
  );
}
