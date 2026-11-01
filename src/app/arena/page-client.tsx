"use client"
import React, { useState, useEffect } from 'react';
import { Shell } from '@/components/layout/Shell';
import { Matchmaking } from '@/components/arena/Matchmaking';
import { BattleArenaMultiplayer as BattleArena } from '@/components/arena/BattleArenaMultiplayer';
import { ArenaHeader } from '@/components/arena/ArenaHeader';
import { PrivateRoomPanel } from '@/components/arena/PrivateRoomPanel';
import { useUser } from '@/firebase/auth/use-user';
import { fetchMatchHistory, fetchActiveBattleCount, fetchOnlinePlayerCount } from '@/services/arena';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Swords, Trophy, Zap, Shield, Users, TrendingUp,
  Star, Target, Gamepad2, Scroll, Loader2, Sword, BookOpen,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { MatchRecord } from '@/types';

const TIER_DISPLAY: Record<string, { label: string; color: string; border: string; bg: string }> = {
  Unrated: { label: 'Unrated', color: 'text-muted-foreground', border: 'border-border', bg: 'bg-muted/30' },
  Beginner: { label: 'Bronze', color: 'text-amber-600', border: 'border-amber-600/40', bg: 'bg-amber-600/10' },
  Learner: { label: 'Silver', color: 'text-slate-300', border: 'border-slate-400/40', bg: 'bg-slate-400/10' },
  Intermediate: { label: 'Gold', color: 'text-yellow-400', border: 'border-yellow-500/40', bg: 'bg-yellow-500/10' },
  Advanced: { label: 'Platinum', color: 'text-cyan-400', border: 'border-cyan-500/40', bg: 'bg-cyan-500/10' },
  Expert: { label: 'Diamond', color: 'text-blue-400', border: 'border-blue-500/40', bg: 'bg-blue-500/10' },
  Master: { label: 'Grandmaster', color: 'text-red-400', border: 'border-red-500/40', bg: 'bg-red-500/10' },
};

export default function ArenaPage() {
  const { user } = useUser();

  const [inBattle, setInBattle] = useState(false);
  const [opponent, setOpponent] = useState<{ id: string; username: string; rating: number; tier: string } | null>(null);
  const [battleId, setBattleId] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [recentMatches, setRecentMatches] = useState<MatchRecord[]>([]);
  const [activeBattles, setActiveBattles] = useState(0);
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const [view, setView] = useState<'matchmaking' | 'private' | 'arena'>('arena');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setRecentMatches([]);
      setActiveBattles(0);
      setOnlinePlayers(0);
      setReconnecting(false);
      return;
    }
    let mounted = true;
    setLoadError(null);
    setReconnecting(true);

    async function loadData() {
      try {
        const { initializeFirebase } = await import('@/firebase');
        const { doc, getDoc } = await import('firebase/firestore');
        const { firestore: db } = initializeFirebase();
        if (!db) throw new Error('The arena database is not configured.');
        const snap = await getDoc(doc(db, 'users', user!.uid));
        if (mounted) setProfile(snap.exists() ? snap.data() : null);

        const [matches, active, online] = await Promise.all([
          fetchMatchHistory(user!.uid),
          fetchActiveBattleCount(user!.uid),
          fetchOnlinePlayerCount(),
        ]);
        if (mounted) {
          setRecentMatches(matches);
          setActiveBattles(active);
          setOnlinePlayers(online);
        }
      } catch (cause) {
        if (mounted) setLoadError(cause instanceof Error ? cause.message : 'Arena data could not be loaded.');
      }
    }
    loadData();

    async function checkActiveBattle() {
      try {
        const { initializeFirebase } = await import('@/firebase');
        const { doc, getDoc, collection, query, where, getDocs, limit } = await import('firebase/firestore');
        const { firestore: db } = initializeFirebase();
        if (!db) { if (mounted) setReconnecting(false); return; }

        const [q1, q2] = await Promise.all([
          getDocs(query(collection(db, 'battles'), where('participants', 'array-contains', user!.uid), where('status', '==', 'active'), limit(10))),
          getDocs(query(collection(db, 'battles'), where('participants', 'array-contains', user!.uid), where('status', '==', 'countdown'), limit(10))),
        ]);
        const battleSnaps = [...q1.docs, ...q2.docs];
        for (const bs of battleSnaps) {
          const bd = bs.data();
          const isPlayer1 = bd.player1?.userId === user!.uid;
          const isPlayer2 = bd.player2?.userId === user!.uid;
          if (isPlayer1 || isPlayer2) {
            const enemyData = isPlayer1 ? bd.player2 : bd.player1;
            if (mounted && enemyData) {
              setBattleId(bs.id);
              setOpponent({ id: enemyData.userId, username: enemyData.username, rating: enemyData.rating, tier: enemyData.tier || 'Beginner' });
              setInBattle(true);
              break;
            }
          }
        }
      } catch (cause) {
        if (mounted) setLoadError(cause instanceof Error ? cause.message : 'Your active battle could not be checked.');
      }
      if (mounted) setReconnecting(false);
    }

    checkActiveBattle();
    return () => { mounted = false; };
  }, [user, refreshKey]);

  const handleMatchFound = (foundOpponent: { id: string; username: string; rating: number; tier: string }, foundBattleId?: string) => {
    setOpponent(foundOpponent);
    if (foundBattleId) setBattleId(foundBattleId);
    setInBattle(true);
  };

  const handleBattleEnd = () => {
    setInBattle(false);
    setOpponent(null);
    setBattleId(null);
    setView('arena');
  };

  if (reconnecting) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-[60vh]">
          <div className="text-center space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
            <p className="text-muted-foreground font-mono text-sm">Scanning the arena...</p>
          </div>
        </div>
      </Shell>
    );
  }

  if (inBattle && opponent && battleId) {
    return (
      <Shell>
        <BattleArena opponent={opponent} battleId={battleId} onBattleEnd={handleBattleEnd} />
      </Shell>
    );
  }

  const rawTier = (profile?.tier || 'Unrated') as string;
  const tier = TIER_DISPLAY[rawTier] || TIER_DISPLAY.Unrated;
  const winRate = profile && (profile.wins + profile.losses) > 0
    ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100) : 0;

  return (
    <Shell>
      <div className="max-w-6xl mx-auto space-y-8 py-6">
        <ArenaHeader
          activeBattles={activeBattles}
          onlinePlayers={onlinePlayers}
          userRating={typeof profile?.rating === 'number' ? profile.rating : undefined}
          userTier={tier?.label}
        />

        {loadError && (
          <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{loadError}</p>
            <Button size="sm" variant="outline" onClick={() => setRefreshKey((key) => key + 1)}>Retry</Button>
          </div>
        )}

        <Tabs
          value={view}
          onValueChange={(value) => {
            if (value === 'arena' || value === 'matchmaking' || value === 'private') setView(value);
          }}
          className="w-full"
        >
          <TabsList className="w-full grid grid-cols-3 h-14 bg-card/50 border border-border/80">
            <TabsTrigger value="arena" className="text-xs font-bold uppercase tracking-widest data-[state=active]:text-primary">
              <Swords className="w-4 h-4 mr-2" /> Arena
            </TabsTrigger>
            <TabsTrigger value="matchmaking" className="text-xs font-bold uppercase tracking-widest data-[state=active]:text-primary">
              <Zap className="w-4 h-4 mr-2" /> Matchmaking
            </TabsTrigger>
            <TabsTrigger value="private" className="text-xs font-bold uppercase tracking-widest data-[state=active]:text-primary">
              <Shield className="w-4 h-4 mr-2" /> Private Room
            </TabsTrigger>
          </TabsList>

          <TabsContent value="arena" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-6">
                <Card className="bg-card/60 border-border/80 overflow-hidden relative group">
                  <div className="absolute inset-0 bg-primary/5 pointer-events-none" />
                  <div className="p-6 relative z-10">
                    <div className="flex items-center gap-4 mb-5">
                      <div className={cn("w-14 h-14 rounded-xl border-2 flex items-center justify-center", tier.border, tier.bg)}>
                        <Trophy className={cn("w-7 h-7", tier.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-headline font-bold text-lg truncate">{profile?.username || user?.displayName || user?.email?.split('@')[0] || 'Player'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {tier && (
                            <Badge variant="outline" className={cn("text-[10px] px-2 py-0 font-bold", tier.color, tier.border, tier.bg)}>
                              {tier.label}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground font-mono">
                            {typeof profile?.rating === 'number' ? `${profile.rating} ELO` : 'Unrated'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'Wins', value: profile ? profile.wins ?? 0 : '—', icon: Trophy, color: 'text-emerald-400' },
                        { label: 'Losses', value: profile ? profile.losses ?? 0 : '—', icon: Shield, color: 'text-red-400' },
                        { label: 'Draws', value: profile ? profile.draws ?? 0 : '—', icon: Star, color: 'text-yellow-400' },
                      ].map(stat => (
                        <div key={stat.label} className="text-center p-2 rounded-lg bg-muted/30 border border-border/50">
                          <stat.icon className={cn("w-4 h-4 mx-auto mb-1", stat.color)} />
                          <p className="text-lg font-bold font-headline">{stat.value}</p>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                        </div>
                      ))}
                    </div>

                    {winRate > 0 && (
                      <div className="mt-4 pt-4 border-t border-border/50">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5" /> Win Rate
                          </span>
                          <span className={cn("font-bold font-mono", winRate >= 50 ? 'text-emerald-400' : 'text-red-400')}>{winRate}%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                <Card className="bg-card/60 border-border/80">
                  <div className="p-4 border-b border-border/60 flex items-center gap-2">
                    <Scroll className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Recent Matches</h3>
                  </div>
                  <div className="divide-y divide-border/30">
                    {recentMatches.length === 0 ? (
                      <div className="p-6 text-center">
                        <Gamepad2 className="w-8 h-8 text-muted-foreground/60 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">No matches yet. Enter the arena!</p>
                      </div>
                    ) : (
                      recentMatches.slice(0, 5).map((match, i) => {
                        const myPlayer = match.players?.find(p => p.uid === user?.uid);
                        const result = myPlayer?.result || 'DRAW';
                        const eloChange = myPlayer?.eloChange || 0;
                        return (
                          <div key={match.id || i} className="px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors">
                            <div className={cn("w-2 h-2 rounded-full shrink-0", result === 'WIN' ? 'bg-emerald-400' : result === 'LOSS' ? 'bg-red-400' : 'bg-yellow-400')} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">vs {match.players?.find(p => p.uid !== user?.uid)?.username || 'Unknown'}</p>
                              <p className="text-[10px] text-muted-foreground font-mono">{match.problem?.title || 'Battle'}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={cn("text-xs font-bold", result === 'WIN' ? 'text-emerald-400' : result === 'LOSS' ? 'text-red-400' : 'text-yellow-400')}>
                                {result}
                              </p>
                              {eloChange !== 0 && (
                                <p className={cn("text-[10px] font-mono", eloChange > 0 ? 'text-emerald-400' : 'text-red-400')}>
                                  {eloChange > 0 ? '+' : ''}{eloChange}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </Card>
              </div>

              <div className="lg:col-span-2 space-y-6">
                <Card className="relative overflow-hidden group cursor-pointer border-primary/30 bg-primary/10"
                  onClick={() => setView('matchmaking')}>
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(6,182,212,0.08),transparent_60%)] pointer-events-none" />
                  <div className="p-8 relative z-10">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <Badge className="bg-primary/15 text-primary border-primary/30 text-[10px] px-3 py-1 mb-3">
                          <Zap className="w-3 h-3 mr-1" /> Queue-based battle
                        </Badge>
                        <h2 className="text-2xl font-headline font-bold uppercase tracking-tighter">1v1 Battle</h2>
                        <p className="text-muted-foreground text-sm mt-1 max-w-md">
                          Match using your selected rated or casual queue settings. Matched players receive the same published problem.
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30">
                        <Swords className="w-8 h-8 text-primary" />
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <Button size="lg" className="h-14 px-8 text-base font-headline font-bold gap-2 bg-primary hover:bg-primary/90 group/btn">
                        <Zap className="w-5 h-5 group-hover/btn:animate-pulse" /> FIND MATCH
                      </Button>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {onlinePlayers} online</span>
                        <span className="flex items-center gap-1"><Sword className="w-3 h-3" /> {activeBattles} active</span>
                      </div>
                    </div>
                  </div>
                </Card>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="bg-card/60 border-border/80 hover:border-emerald-500/30 transition-all group cursor-pointer"
                    onClick={() => setView('matchmaking')}>
                    <div className="p-6">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Target className="w-5 h-5 text-emerald-400" />
                      </div>
                      <h3 className="font-headline font-bold text-sm uppercase tracking-wider mb-1">Quick Match</h3>
                      <p className="text-muted-foreground text-xs mb-3">Search using your selected rated or casual queue settings.</p>
                      <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/5">Queue option</Badge>
                    </div>
                  </Card>

                  <Card className="bg-card/60 border-border/80 hover:border-purple-500/30 transition-all group cursor-pointer"
                    onClick={() => setView('private')}>
                    <div className="p-6">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <Shield className="w-5 h-5 text-purple-400" />
                      </div>
                      <h3 className="font-headline font-bold text-sm uppercase tracking-wider mb-1">Private Room</h3>
                      <p className="text-muted-foreground text-xs mb-3">Create or join private rooms to battle friends.</p>
                      <Badge variant="outline" className="text-[10px] text-purple-400 border-purple-500/30 bg-purple-500/5">Room controls</Badge>
                    </div>
                  </Card>

                  <Link
                    href="/arena/custom-study"
                    className="block"
                  >
                    <Card className="bg-card/60 border-border/80 hover:border-emerald-500/30 transition-all group cursor-pointer h-full">
                      <div className="p-6">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <BookOpen className="w-5 h-5 text-emerald-400" />
                        </div>
                        <h3 className="font-headline font-bold text-sm uppercase tracking-wider mb-1">Study Room</h3>
                        <p className="text-muted-foreground text-xs mb-3">Collaborative coding rooms. Solve problems together — no ELO pressure.</p>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/5">Queue option</Badge>
                          <Badge variant="outline" className="text-[10px] text-secondary border-secondary/30 bg-secondary/5">No ELO</Badge>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="matchmaking" className="mt-6">
            <Matchmaking
              onMatchFound={handleMatchFound}
              onSelectPrivateRoom={() => setView('private')}
            />
          </TabsContent>

          <TabsContent value="private" className="mt-6">
            <PrivateRoomPanel />
          </TabsContent>
        </Tabs>
      </div>
    </Shell>
  );
}
