'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ArrowLeft, Calendar, Loader2, RefreshCw, Trophy, Users } from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import { useFirestore } from '@/firebase/provider';
import { doc, getDoc } from 'firebase/firestore';
import type { Hackathon } from '@/types';

export default function HackathonDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useUser();
  const db = useFirestore();
  const [hackathon, setHackathon] = useState<Hackathon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadHackathon() {
      if (authLoading) return;
      if (!user) {
        setHackathon(null);
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
        const snapshot = await getDoc(doc(db, 'hackathons', id));
        if (active) setHackathon(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Hackathon) : null);
      } catch {
        if (active) setError('Unable to load this hackathon. Check your connection and try again.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadHackathon();
    return () => { active = false; };
  }, [authLoading, db, id, retry, user]);

  return (
    <Shell>
      <div className="space-y-6">
        <Button variant="ghost" asChild className="-ml-2 gap-2">
          <Link href="/hackathons"><ArrowLeft className="h-4 w-4" /> Back to Hackathons</Link>
        </Button>

        {authLoading || loading ? (
          <div className="flex min-h-56 items-center justify-center" aria-label="Loading hackathon">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !user ? (
          <Card><CardContent className="space-y-3 p-8 text-center">
            <h1 className="font-semibold">Sign in to view this hackathon</h1>
            <Button asChild><Link href="/auth">Sign in</Link></Button>
          </CardContent></Card>
        ) : error ? (
          <Card role="alert" className="border-destructive/40">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <span className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</span>
              <Button variant="outline" size="sm" onClick={() => setRetry((current) => current + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : !hackathon ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Hackathon not found.</CardContent></Card>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
            <main className="space-y-6">
              {hackathon.bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hackathon.bannerUrl} alt="" className="max-h-80 w-full rounded-xl border object-cover" />
              ) : null}
              <header className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{hackathon.status}</Badge>
                  <Badge variant="secondary">{hackathon.difficulty}</Badge>
                  {hackathon.categories.map((category) => <Badge key={category} variant="outline">{category}</Badge>)}
                </div>
                <h1 className="text-3xl font-headline font-bold">{hackathon.title}</h1>
                <p className="text-lg text-muted-foreground">{hackathon.subtitle}</p>
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{hackathon.description}</p>
              </header>

              {hackathon.rules.length > 0 && (
                <Card><CardHeader><CardTitle className="text-base">Rules</CardTitle></CardHeader>
                  <CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                    {hackathon.rules.map((rule, index) => <li key={`${index}-${rule}`}>{rule}</li>)}
                  </ul></CardContent>
                </Card>
              )}

              {hackathon.judgingCriteria.length > 0 && (
                <Card><CardHeader><CardTitle className="text-base">Judging criteria</CardTitle></CardHeader>
                  <CardContent><ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                    {hackathon.judgingCriteria.map((criterion, index) => <li key={`${index}-${criterion}`}>{criterion}</li>)}
                  </ul></CardContent>
                </Card>
              )}

              {hackathon.prizes.length > 0 && (
                <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Trophy className="h-4 w-4" /> Prizes</CardTitle></CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2">
                    {hackathon.prizes.map((prize) => (
                      <div key={`${prize.rank}-${prize.reward}`} className="rounded-lg border p-4">
                        <p className="font-semibold">{prize.rank}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{prize.reward}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </main>

            <aside className="space-y-4">
              <Card><CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-2 text-sm"><Calendar className="h-4 w-4 text-primary" /> {formatDate(hackathon.startDate)} – {formatDate(hackathon.endDate)}</div>
                <div className="flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-primary" /> {hackathon.participants} participants</div>
                <div><p className="text-xs text-muted-foreground">Organizer</p><p className="mt-1 font-medium">{hackathon.organizer}</p></div>
                <div><p className="text-xs text-muted-foreground">Registration deadline</p><p className="mt-1 text-sm">{formatDate(hackathon.registrationDeadline)}</p></div>
                <div><p className="text-xs text-muted-foreground">Team size</p><p className="mt-1 text-sm">{hackathon.minTeamSize}–{hackathon.maxTeamSize}</p></div>
                <div><p className="text-xs text-muted-foreground">Prize pool</p><p className="mt-1 text-sm">{hackathon.prizePool || 'Not specified'}</p></div>
              </CardContent></Card>

              {hackathon.sponsors.length > 0 && (
                <Card><CardHeader><CardTitle className="text-base">Sponsors</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {hackathon.sponsors.map((sponsor) => <Badge key={sponsor.name} variant="secondary">{sponsor.name}</Badge>)}
                  </CardContent>
                </Card>
              )}
              <p className="text-xs text-muted-foreground">
                Team registration is not available from this page yet; no registration will be shown as successful.
              </p>
            </aside>
          </div>
        )}
      </div>
    </Shell>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString();
}
