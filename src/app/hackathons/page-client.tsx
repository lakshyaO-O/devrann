'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Loader2, RefreshCw, Rocket, Trophy, Users } from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase/provider';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import type { Hackathon } from '@/types';

type EventFilter = 'all' | 'upcoming' | 'active' | 'completed';

const FILTERS: { id: EventFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
];

export default function HackathonsPage() {
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [filter, setFilter] = useState<EventFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadHackathons() {
      if (authLoading) return;
      if (!user) {
        setHackathons([]);
        setLoading(false);
        return;
      }
      if (!db) {
        setError('Firebase is not configured for this environment.');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const snapshot = await getDocs(query(collection(db, 'hackathons'), orderBy('startDate', 'asc'), limit(50)));
        if (active) setHackathons(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as Hackathon)));
      } catch {
        if (active) setError('Unable to load hackathons. Check your connection and try again.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadHackathons();
    return () => { active = false; };
  }, [authLoading, db, user, retry]);

  const visibleHackathons = useMemo(() =>
    hackathons.filter((item) => filter === 'all' || item.status === filter),
  [hackathons, filter]);

  const activeCount = hackathons.filter((item) => item.status === 'active').length;
  const participantCount = hackathons.reduce((sum, item) => sum + (Number.isFinite(item.participants) ? item.participants : 0), 0);

  return (
    <Shell>
      <div className="space-y-7">
        <header className="space-y-2">
          <h1 className="text-4xl font-headline font-bold">Hackathons</h1>
          <p className="text-muted-foreground">Real events stored in DevRann. No event previews are shown as scheduled events.</p>
        </header>

        {authLoading || loading ? (
          <div className="flex min-h-56 items-center justify-center" aria-label="Loading hackathons">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !user ? (
          <Card><CardContent className="p-8 text-center">
            <p className="font-semibold">Sign in to browse hackathons</p>
            <p className="mt-2 text-sm text-muted-foreground">Hackathon records are currently available to authenticated members.</p>
            <Button asChild className="mt-4"><Link href="/auth">Sign in</Link></Button>
          </CardContent></Card>
        ) : error ? (
          <Card role="alert" className="border-destructive/40">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" size="sm" onClick={() => setRetry((current) => current + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard icon={Calendar} label="Events listed" value={hackathons.length} />
              <SummaryCard icon={Rocket} label="Active events" value={activeCount} />
              <SummaryCard icon={Users} label="Participants across listed events" value={participantCount} />
            </div>

            <div className="flex flex-wrap gap-2" aria-label="Filter hackathons">
              {FILTERS.map((item) => (
                <Button key={item.id} variant={filter === item.id ? 'default' : 'outline'} size="sm" onClick={() => setFilter(item.id)}>
                  {item.label}
                </Button>
              ))}
            </div>

            {visibleHackathons.length === 0 ? (
              <Card><CardContent className="space-y-2 p-10 text-center">
                <Trophy className="mx-auto h-8 w-8 text-muted-foreground" />
                <h2 className="font-semibold">No {filter === 'all' ? '' : `${filter} `}hackathons available</h2>
                <p className="text-sm text-muted-foreground">Published events will appear here when they are added to DevRann.</p>
              </CardContent></Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {visibleHackathons.map((hackathon) => (
                  <Link key={hackathon.id} href={`/hackathons/${hackathon.id}`}>
                    <Card className="h-full transition-colors hover:border-primary/40">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h2 className="text-lg font-semibold">{hackathon.title}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{hackathon.subtitle}</p>
                          </div>
                          <Badge variant="outline">{hackathon.status}</Badge>
                        </div>
                        <p className="line-clamp-3 text-sm text-muted-foreground">{hackathon.description}</p>
                        <div className="flex flex-wrap gap-2">
                          {hackathon.categories.map((category) => <Badge key={category} variant="secondary">{category}</Badge>)}
                        </div>
                        <div className="flex flex-wrap justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                          <span>{formatDate(hackathon.startDate)} – {formatDate(hackathon.endDate)}</span>
                          <span>{hackathon.participants} participants</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Shell>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <Icon className="h-5 w-5 text-primary" />
        <div>
          <p className="text-xl font-semibold">{value.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString();
}
