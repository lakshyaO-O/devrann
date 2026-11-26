'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, RefreshCw, BookmarkCheck, ChevronLeft, ChevronRight, X, AlertCircle, Loader2 } from 'lucide-react';
import { ProblemCard } from './ProblemCard';
import { ProblemFilters } from './ProblemFilters';
import type { PracticeProblemSummary, Difficulty } from '@/types';
import { useProblemCatalogPage } from '@/hooks/use-practice-problems';

interface ProblemBrowserProps {
  progress: Record<string, { solved: boolean; bookmarked: boolean }>;
  isBeginner: boolean;
  unlockedDifficulties: Difficulty[];
  canAccess: (d: Difficulty) => boolean;
  onStartProblem: (p: PracticeProblemSummary) => void;
  onResetFilters?: () => void;
}

export function ProblemBrowser({
  progress, isBeginner, unlockedDifficulties, canAccess,
  onStartProblem, onResetFilters,
}: ProblemBrowserProps) {
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<string>('All');
  const [topic, setTopic] = useState<string>('All');
  const [tab, setTab] = useState('all');
  const [sortBy, setSortBy] = useState<string>('Default');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);
  const [cursorStack, setCursorStack] = useState<Array<string | null>>([null]);
  const sort = sortBy === 'XP (Low)' ? 'points-asc'
    : sortBy === 'XP (High)' ? 'points-desc'
    : sortBy === 'Difficulty' ? 'difficulty'
    : 'title';
  const {
    problems, nextCursor, hasMore, loading, error, retry,
  } = useProblemCatalogPage({
    search,
    difficulty: difficulty === 'All' ? '' : difficulty,
    topic: topic === 'All' ? '' : topic,
    sort,
    status: tab === 'solved' ? 'solved'
      : tab === 'unsolved' ? 'unsolved'
      : tab === 'bookmarked' ? 'bookmarked'
      : 'all',
    cursor: cursorStack[page] ?? null,
  });

  const filteredProblems = useMemo(() => {
    if (isBeginner && difficulty === 'All') return problems.filter((p) => canAccess(p.difficulty));
    return problems;
  }, [problems, isBeginner, difficulty, canAccess]);

  const handleResetFilters = () => {
    setSearch('');
    setDifficulty('All');
    setTopic('All');
    setTab('all');
    setSortBy('Default');
    setPage(0);
    setCursorStack([null]);
    onResetFilters?.();
  };

  const activeFilterCount = [difficulty !== 'All', topic !== 'All', sortBy !== 'Default', !!search].filter(Boolean).length;
  const resetPage = () => {
    setPage(0);
    setCursorStack([null]);
  };

  return (
    <Tabs defaultValue="all" className="space-y-4" onValueChange={(v) => { setTab(v); resetPage(); }}>
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="unsolved">Unsolved</TabsTrigger>
          <TabsTrigger value="solved">Solved</TabsTrigger>
          <TabsTrigger value="bookmarked">
            <BookmarkCheck className="w-3 h-3 mr-1" />
            Saved
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:max-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 pointer-events-none" />
            <Input
              placeholder="Title prefix or ID (use id:...)"
              className="pl-8 h-8 text-sm"
              value={search}
              onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            />
            {search && (
              <button
                onClick={() => { setSearch(''); resetPage(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <Button
            variant={showFilters || activeFilterCount > 0 ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1.5 h-8"
          >
            Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}
          </Button>
        </div>
      </div>

      {showFilters && (
        <ProblemFilters
          difficulty={difficulty}
          topic={topic}
          sortBy={sortBy}
          isBeginner={isBeginner}
          unlockedDifficulties={unlockedDifficulties}
          disableSort={!!search.trim()}
          onDifficultyChange={(d) => { setDifficulty(d); resetPage(); }}
          onTopicChange={(t) => { setTopic(t); resetPage(); }}
          onSortChange={(s) => { setSortBy(s); resetPage(); }}
          onClearTopic={() => { setTopic('All'); resetPage(); }}
        />
      )}

      <TabsContent value={tab} className="mt-0 space-y-2">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : error ? (
          <div className="py-12 text-center">
            <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive" />
            <p className="font-medium">Problem catalog unavailable</p>
            <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={retry}>Retry</Button>
          </div>
        ) : filteredProblems.length > 0 ? (
          <>
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-medium text-muted-foreground">
                {filteredProblems.length} problem{filteredProblems.length !== 1 ? 's' : ''} on this page
              </span>
              {search && (
                <span className="text-xs text-muted-foreground">
                  Searching: &ldquo;{search}&rdquo;
                </span>
              )}
            </div>
            {filteredProblems.map((problem: PracticeProblemSummary) => (
              <ProblemCard
                key={problem.id}
                problem={problem}
                solved={!!progress[problem.id]?.solved}
                bookmarked={!!progress[problem.id]?.bookmarked}
                locked={isBeginner && !canAccess(problem.difficulty)}
                onSelect={() => onStartProblem(problem)}
              />
            ))}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Search className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="font-medium text-muted-foreground">
              {problems.length || hasMore ? 'No matching problems on this page' : 'No matching problems'}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {problems.length || hasMore
                ? 'Continue to the next catalog page or adjust your filters.'
                : 'Try another title prefix, ID, or filter.'}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 gap-1.5"
              onClick={handleResetFilters}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Filters
            </Button>
          </div>
        )}
        {!loading && !error && (page > 0 || hasMore) && (
          <div className="flex items-center justify-center gap-2 pt-2 pb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0}
              className="h-7"
            >
              <ChevronLeft className="w-3 h-3 mr-1" /> Prev
            </Button>
            <span className="text-xs font-mono text-muted-foreground">Page {page + 1}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!nextCursor) return;
                setCursorStack((stack) => [...stack.slice(0, page + 1), nextCursor]);
                setPage((current) => current + 1);
              }}
              disabled={!hasMore || !nextCursor}
              className="h-7"
            >
              Next <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
