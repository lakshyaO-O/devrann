'use client';

import React, { useMemo, useState } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search,
  SearchX,
  ChevronRight,
  ChevronLeft,
  Code2,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Bookmark,
} from 'lucide-react';
import { EmptyState } from '@/components/premium/EmptyState';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { useProblemCatalogPage, useProblemStats, useUserProgress } from '@/hooks/use-practice-problems';
import { useUser } from '@/firebase/auth/use-user';
import type { Difficulty } from '@/types';
import type { ProblemCatalogQuery } from '@/services/practice';
import { ALL_TOPICS } from '@/features/practice/components/ProblemFilters';

type SortOption = NonNullable<ProblemCatalogQuery['sort']>;

const DIFFICULTIES: Array<'All' | Difficulty> = ['All', 'Easy', 'Medium', 'Hard'];
const PROGRESS_FILTERS = ['All', 'Unsolved', 'Attempted', 'Solved', 'Saved'] as const;
const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'title', label: 'Title (Aâ€“Z)' },
  { value: 'difficulty', label: 'Difficulty' },
  { value: 'points-asc', label: 'XP (low to high)' },
  { value: 'points-desc', label: 'XP (high to low)' },
];
type ProgressFilter = typeof PROGRESS_FILTERS[number];

export default function ProblemsPage() {
  const { user } = useUser();
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<'All' | Difficulty>('All');
  const [topic, setTopic] = useState('All');
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>('All');
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [sort, setSort] = useState<SortOption>('title');
  const {
    problems, nextCursor, hasMore, loading, error, retry,
  } = useProblemCatalogPage({
    search,
    difficulty: difficulty === 'All' ? '' : difficulty,
    topic: topic === 'All' ? '' : topic,
    sort,
    status: progressFilter === 'Solved' ? 'solved'
      : progressFilter === 'Unsolved' ? 'unsolved'
      : progressFilter === 'Attempted' ? 'attempted'
      : progressFilter === 'Saved' ? 'bookmarked'
      : 'all',
    cursor: cursorStack[pageIndex] ?? null,
  });
  const { progress, loading: progressLoading } = useUserProgress(user?.uid || null);
  const { stats: catalogStats, loading: statsLoading } = useProblemStats();

  const topics = useMemo(
    () => [...new Set([...ALL_TOPICS, ...problems.flatMap((problem) => problem.topics || [])])].sort(),
    [problems],
  );

  const filteredProblems = problems;

  const counts = useMemo(() => ({
    Easy: problems.filter((problem) => problem.difficulty === 'Easy').length,
    Medium: problems.filter((problem) => problem.difficulty === 'Medium').length,
    Hard: problems.filter((problem) => problem.difficulty === 'Hard').length,
  }), [problems]);

  const resetPage = () => {
    setCursorStack([null]);
    setPageIndex(0);
  };

  const resetFilters = () => {
    setSearch('');
    setDifficulty('All');
    setTopic('All');
    setProgressFilter('All');
    setSort('title');
    resetPage();
  };

  return (
    <Shell>
      <div className="mx-auto max-w-6xl space-y-7">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <h1 className="text-4xl font-headline font-bold text-foreground">Problem Library</h1>
            <p className="text-muted-foreground">
              Search and filter the published catalog. Results are loaded in pages from the server.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/practice">Open practice dashboard <ChevronRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DifficultyCard label="Published total" color="text-emerald-400" bgColor="bg-emerald-500/10" count={catalogStats?.total ?? 0} />
          <DifficultyCard label="Easy" color="text-primary" bgColor="bg-primary/10" count={catalogStats?.difficulty.Easy ?? 0} />
          <DifficultyCard label="Medium" color="text-destructive" bgColor="bg-destructive/10" count={catalogStats?.difficulty.Medium ?? 0} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <DifficultyCard label="Hard" color="text-emerald-400" bgColor="bg-emerald-500/10" count={catalogStats?.difficulty.Hard ?? 0} />
          <DifficultyCard label="On this page" color="text-primary" bgColor="bg-primary/10" count={problems.length} />
          <DifficultyCard label="Catalog stats" color="text-destructive" bgColor="bg-destructive/10" count={statsLoading ? 0 : catalogStats?.topics ? Object.keys(catalogStats.topics).length : 0} />
        </div>

        <Card className="border-border bg-card/50">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search problems"
                  placeholder="Title prefix or ID (use id:...)"
                  className="border-border bg-muted/50 pl-10"
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); resetPage(); }}
                />
              </div>
              <select
                aria-label="Filter by topic"
                value={topic}
                onChange={(event) => { setTopic(event.target.value); resetPage(); }}
                className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              >
                <option value="All">All topics</option>
                {topics.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {DIFFICULTIES.map((level) => (
                <Button
                  key={level}
                  variant={difficulty === level ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setDifficulty(level); resetPage(); }}
                >
                  {level}
                </Button>
              ))}
              <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
              {PROGRESS_FILTERS.map((filter) => (
                <Button
                  key={filter}
                  variant={progressFilter === filter ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => { setProgressFilter(filter); resetPage(); }}
                >
                  {filter === 'Solved' && <CheckCircle2 className="mr-1 h-3.5 w-3.5" />}
                  {filter === 'Saved' && <Bookmark className="mr-1 h-3.5 w-3.5" />}
                  {filter}
                </Button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                {filteredProblems.length} result{filteredProblems.length === 1 ? '' : 's'} on this page
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-border bg-card/50">
          {loading || progressLoading ? (
            <div className="flex justify-center p-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : error ? (
            <div className="p-10 text-center">
              <AlertCircle className="mx-auto mb-3 h-6 w-6 text-destructive" />
              <h2 className="font-semibold">Published problems couldn&apos;t be loaded</h2>
              <p className="mt-2 text-sm text-muted-foreground">The problem catalog is temporarily unavailable.</p>
              <Button variant="outline" className="mt-4" onClick={retry}>Retry</Button>
            </div>
          ) : problems.length === 0 && pageIndex === 0 && !hasMore ? (
            <EmptyState
              icon={Code2}
              title="No published problems match this query"
              description="Try another title prefix, ID, topic, difficulty, or progress filter."
              className="py-12"
            />
          ) : filteredProblems.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={problems.length ? 'No matching problems on this page' : 'No more matching problems'}
              description={problems.length || hasMore
                ? 'Try another progress filter or continue to the next catalog page.'
                : 'Try a different search, topic, difficulty, or progress filter.'}
              actionLabel={problems.length && hasMore ? undefined : 'Clear filters'}
              onAction={problems.length && hasMore ? undefined : resetFilters}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="p-4">Problem</th>
                    <th className="p-4">Topics</th>
                    <th className="p-4">Difficulty</th>
                    <th className="p-4 text-center">XP</th>
                    <th className="p-4">Progress</th>
                    <th className="p-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredProblems.map((problem) => {
                    const state = progress[problem.id];
                    return (
                      <tr key={problem.id} className="group hover:bg-muted/30">
                        <td className="p-4">
                          <div>
                            <span className="font-semibold text-foreground">{problem.title}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{problem.category}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex max-w-sm flex-wrap gap-1">
                            {(problem.topics || []).slice(0, 3).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="p-4">
                          <span className={cn(
                            'text-xs font-bold uppercase tracking-widest',
                            problem.difficulty === 'Easy' ? 'text-emerald-400'
                              : problem.difficulty === 'Medium' ? 'text-primary' : 'text-destructive',
                          )}>
                            {problem.difficulty}
                          </span>
                        </td>
                        <td className="p-4 text-center font-headline font-bold">{problem.points}</td>
                        <td className="p-4">
                          {state?.solved ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Solved</span>
                          ) : state?.bookmarked ? (
                            <span className="inline-flex items-center gap-1 text-xs text-primary"><Bookmark className="h-3.5 w-3.5" /> Saved</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{state?.attempted ? 'Attempted' : 'Unsolved'}</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <Button asChild variant="ghost" size="sm" className="gap-1">
                            <Link href={`/practice?problem=${encodeURIComponent(problem.id)}`}>
                              Solve <ChevronRight className="h-4 w-4" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && !error && (pageIndex > 0 || hasMore) && (
            <div className="flex items-center justify-between border-t border-border p-3">
              <Button
                variant="outline"
                size="sm"
                disabled={pageIndex === 0 || loading}
                onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {pageIndex + 1}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore || !nextCursor || loading}
                onClick={() => {
                  if (!nextCursor) return;
                  setCursorStack((stack) => [...stack.slice(0, pageIndex + 1), nextCursor]);
                  setPageIndex((index) => index + 1);
                }}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}
        </Card>
      </div>
    </Shell>
  );
}

function DifficultyCard({ label, color, bgColor, count }: { label: string; color: string; bgColor: string; count: number }) {
  return (
    <Card className="border-border bg-card/50">
      <CardContent className="flex items-center justify-between p-5">
        <span className={cn('rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest', bgColor, color)}>{label}</span>
        <span className="text-2xl font-headline font-black text-foreground">{count}</span>
      </CardContent>
    </Card>
  );
}
