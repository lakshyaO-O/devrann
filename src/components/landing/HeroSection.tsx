'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronRight, Code2, LogIn, Swords } from 'lucide-react';
import type { PublicProblemPreview } from './public-overview';

interface HeroSectionProps {
  problem: PublicProblemPreview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function ProblemSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-5 w-40 rounded bg-muted" />
      <div className="h-16 rounded bg-muted" />
      <div className="h-32 rounded bg-muted" />
    </div>
  );
}

export function HeroSection({ problem, loading, error, onRetry }: HeroSectionProps) {
  const starterEntry = problem
    ? Object.entries(problem.starterCode).find(([language]) => language.toLowerCase() === 'python')
      || Object.entries(problem.starterCode)[0]
    : undefined;
  const starterCode = starterEntry?.[1] ?? '';

  return (
    <section className="border-b border-border bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="DevRann home">
            <Image src="/logo.svg" alt="" width={28} height={28} unoptimized />
            <span className="text-base font-bold tracking-tight">DevRann</span>
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <Link className="transition-colors hover:text-foreground" href="/practice">Practice</Link>
            <Link className="transition-colors hover:text-foreground" href="/arena">Arena</Link>
            <Link className="transition-colors hover:text-foreground" href="/leaderboard">Leaderboard</Link>
            <Link className="transition-colors hover:text-foreground" href="/community">Community</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/auth?mode=login" className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              <LogIn className="h-4 w-4" />
              <span className="hidden sm:inline">Sign in</span>
            </Link>
            <Link href="/auth?mode=register" className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:px-8 lg:py-20">
        <div className="max-w-xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs text-muted-foreground">
            <Code2 className="h-3.5 w-3.5 text-primary" />
            Practice solo or challenge a friend
          </div>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-[3.5rem]">
            Get better at coding.
            <span className="mt-1 block text-primary">One problem at a time.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground">
            Work through real DSA problems, practice at your own pace, and join a coding battle when you&apos;re ready.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/practice" className="inline-flex h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              Start practicing <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/arena" className="inline-flex h-11 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-muted">
              <Swords className="h-4 w-4 text-primary" /> Explore the arena
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span>Multiple programming languages</span>
            <span className="text-border">/</span>
            <span>Skill-based ratings</span>
          </div>
        </div>

        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm" aria-labelledby="problem-preview-title">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Code2 className="h-4 w-4 text-primary" />
              Available problem
            </div>
            <span className="text-xs text-muted-foreground">Problem preview · not a live battle</span>
          </div>

          {loading ? (
            <ProblemSkeleton />
          ) : error ? (
            <div className="p-6" role="alert">
              <h2 id="problem-preview-title" className="font-semibold">Problem preview unavailable</h2>
              <p className="mt-2 text-sm text-muted-foreground">Live problem data could not be loaded.</p>
              <button type="button" onClick={onRetry} className="mt-4 rounded-md border border-border px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-muted">
                Retry
              </button>
            </div>
          ) : !problem ? (
            <div className="p-6">
              <h2 id="problem-preview-title" className="font-semibold">No published problems yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                New challenges will appear here when they are published.
              </p>
              <Link href="/problems" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Browse problems <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              <div className="grid md:grid-cols-[0.85fr_1.15fr]">
                <div className="border-b border-border p-4 md:border-b-0 md:border-r">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-muted-foreground">PUBLISHED PROBLEM</span>
                    <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{problem.difficulty || 'Difficulty not set'}</span>
                  </div>
                  <h2 id="problem-preview-title" className="mt-3 text-lg font-semibold">{problem.title}</h2>
                  {problem.category && <p className="mt-1 text-xs text-muted-foreground">{problem.category}</p>}
                  <p className="mt-3 line-clamp-5 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                    {problem.description || 'The problem description has not been published yet.'}
                  </p>
                  {problem.examples[0] && (
                    <div className="mt-4 rounded-md border border-border bg-background p-3 font-mono text-xs leading-5">
                      <p className="break-all"><span className="text-muted-foreground">Input: </span>{problem.examples[0].input}</p>
                      <p className="mt-1 break-all"><span className="text-muted-foreground">Output: </span>{problem.examples[0].output}</p>
                    </div>
                  )}
                  <Link href={`/practice?problem=${encodeURIComponent(problem.id)}`} className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    Solve this problem <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className="min-w-0 bg-[#101114]">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5 text-xs">
                    <span className="text-gray-300">
                      {starterEntry ? `Starter code · ${starterEntry[0]}` : 'Starter code'}
                    </span>
                    <span className="text-gray-500">Read-only preview</span>
                  </div>
                  <pre className="min-h-40 overflow-x-auto p-4 font-mono text-xs leading-6 text-gray-300 sm:text-[13px]" aria-label="Published starter code preview">
                    {starterCode || 'Starter code has not been published for this problem.'}
                  </pre>
                  <div className="flex items-center justify-between border-t border-white/10 px-4 py-2.5">
                    <span className="text-[11px] text-gray-500">Open the practice workspace to edit and run code</span>
                    <Link href={`/practice?problem=${encodeURIComponent(problem.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300">
                      Open editor <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
