'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Search as SearchIcon, User, Code2, Loader2, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { usePracticeProblems } from '@/hooks/use-practice-problems';

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState<'all' | 'users' | 'problems'>('all');
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState(false);
  const { problems, loading: problemsLoading, error: problemsError, retry: retryProblems } = usePracticeProblems();

  const loadUsers = useCallback(async (term: string) => {
    if (term.trim().length < 2 || searchType === 'problems') {
      setUsers([]);
      setUsersLoading(false);
      setUsersError(false);
      return;
    }
    setUsersLoading(true);
    setUsersError(false);
    try {
      const response = await fetch(`/api/public/profiles?q=${encodeURIComponent(term.trim())}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Player search is temporarily unavailable.');
      const data = await response.json();
      setUsers(Array.isArray(data.profiles) ? data.profiles : []);
    } catch {
      setUsersError(true);
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [searchType]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadUsers(searchQuery); }, 200);
    return () => window.clearTimeout(timer);
  }, [searchQuery, loadUsers]);
  const retryUsers = () => { void loadUsers(searchQuery); };

  const filteredUsers = (users || []).filter((u: any) =>
    u.banned !== true
    && typeof u.username === 'string'
    && u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const filteredProblems = problems.filter((p) =>
    p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.topics?.some((topic) => topic.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const hasResults = (searchType !== 'problems' && filteredUsers.length > 0)
    || (searchType !== 'users' && filteredProblems.length > 0);
  const searchError = (searchType !== 'problems' && Boolean(usersError))
    || (searchType !== 'users' && Boolean(problemsError));
  const loading = searchType === 'users' ? usersLoading
    : searchType === 'problems' ? problemsLoading
      : usersLoading || problemsLoading;

  return (
    <Shell>
      <div className="space-y-8 max-w-3xl mx-auto">
        <div className="space-y-2">
          <h1 className="text-4xl font-headline font-bold text-foreground">
            Search
          </h1>
          <p className="text-muted-foreground">Find problems, players, and content across the platform.</p>
        </div>

        <Card className="bg-card/50 border-border">
          <CardContent className="p-6 space-y-6">
            <div className="relative">
              <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search by username or problem name..."
                className="pl-12 h-14 text-lg bg-muted/50 border-border"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="flex gap-2">
              {(['all', 'users', 'problems'] as const).map((type) => (
                <Button
                  key={type}
                  variant={searchType === type ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSearchType(type)}
                  className="text-xs font-bold uppercase tracking-widest"
                >
                  {type === 'all' ? 'All' : type}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        )}

        {!loading && searchQuery.length > 0 && (
          <div className="space-y-6">
            {(usersError && searchType !== 'problems') && (
              <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">Player search is temporarily unavailable.</p>
                <Button size="sm" variant="outline" onClick={retryUsers}>Retry</Button>
              </div>
            )}
            {(problemsError && searchType !== 'users') && (
              <div role="alert" className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">Problem search is temporarily unavailable.</p>
                <Button size="sm" variant="outline" onClick={retryProblems}>Retry</Button>
              </div>
            )}
            {!hasResults && !searchError && (
              <div className="text-center py-20 text-muted-foreground">
                <SearchIcon className="w-12 h-12 mx-auto mb-4 opacity-60" />
                <p className="font-bold uppercase tracking-widest text-sm">No results found</p>
                <p className="text-xs mt-2">Try a different search term.</p>
              </div>
            )}

            {searchType !== 'problems' && !usersError && filteredUsers.length > 0 && (
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
                  Players ({filteredUsers.length})
                </h2>
                <div className="space-y-2">
                  {filteredUsers.map((user: any) => (
                    <Link key={user.id} href={`/profile/${user.id}`}>
                      <Card className="bg-card/50 border-border hover:border-primary/30 transition-all cursor-pointer">
                        <CardContent className="p-4 flex items-center gap-4">
                          <Avatar className="h-10 w-10 border border-muted">
                            <AvatarFallback className="bg-muted text-xs">{(user.username || '?')[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-bold">{user.username}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.privacySettings?.showRating === true && typeof user.rating === 'number'
                                ? `${user.rating} ELO${typeof user.tier === 'string' ? ` · ${user.tier}` : ''}`
                                : 'Rating private'}
                            </p>
                          </div>
                          <Button variant="ghost" size="sm" asChild>
                            <span>View Profile</span>
                          </Button>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {searchType !== 'users' && !problemsError && filteredProblems.length > 0 && (
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-4">
                  Problems ({filteredProblems.length})
                </h2>
                <div className="space-y-2">
                  {filteredProblems.map((problem: any) => (
                    <Link key={problem.id} href={`/practice?problem=${encodeURIComponent(problem.id)}`}>
                      <Card className="bg-card/50 border-border hover:border-primary/30 transition-all cursor-pointer">
                        <CardContent className="p-4 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                            <Code2 className="w-5 h-5 text-muted-foreground" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold">{problem.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={cn(
                                'text-[11px] font-medium uppercase tracking-wider',
                                problem.difficulty === 'Easy' ? 'text-emerald-400' :
                                problem.difficulty === 'Medium' ? 'text-yellow-400' : 'text-destructive'
                              )}>
                                {problem.difficulty}
                              </span>
                              <span className="text-[10px] text-muted-foreground">•</span>
                              <span className="text-[10px] text-muted-foreground">{problem.category}</span>
                              <span className="text-[10px] text-muted-foreground">•</span>
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Zap className="w-3 h-3" /> {problem.points} pts
                              </span>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm">Solve</Button>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!usersLoading && searchQuery.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <SearchIcon className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm font-bold uppercase tracking-widest">Start typing to search</p>
            <p className="text-xs mt-2">Search for players by username or problems by name.</p>
          </div>
        )}
      </div>
    </Shell>
  );
}
