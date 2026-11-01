'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ArrowUpRight, Check, Code2, Flame, Loader2, Medal, Share2, Target, Trophy } from 'lucide-react';
import { initializeFirebase } from '@/firebase';
import { calculateSubmissionStreak } from '@/lib/profile-stats';
import { useUser } from '@/firebase/auth/use-user';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface ProfileActivity {
  profile: {
    username: string;
    photoURL: string;
    bio: string;
    interests: string[];
    createdAt: string | null;
    isProfilePublic: boolean;
    rating: number | null;
    highestRating: number | null;
    wins: number;
    losses: number;
    draws: number;
  };
  practice: {
    solved: number;
    attempted: number;
    submissions: number;
    difficulty: { Easy: number; Medium: number; Hard: number };
    topics: Record<string, { solved: number }>;
  };
  recentSubmissions: Array<{
    id: string;
    problemId: string;
    verdict: string;
    language: string;
    submittedAt: string | null;
    executionTimeMs?: number;
  }>;
  activity: Record<string, number>;
  activityTruncated: boolean;
  ratingHistory: Array<{ matchId: string; timestamp: string | null; rating: number | null; change: number }>;
  matchHistory: Array<{
    id: string;
    opponent: string;
    result: string;
    ratingChange: number | null;
    timestamp: string | null;
    problemTitle: string;
  }>;
}

function useProfileActivity(uid: string | undefined) {
  const [data, setData] = useState<ProfileActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!uid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { auth } = initializeFirebase();
      const user = auth?.currentUser;
      if (!user || user.uid !== uid) throw new Error('Sign in to view your profile activity.');
      const token = await user.getIdToken();
      const response = await fetch('/api/profile/me', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to load your profile activity.');
      setData(result as ProfileActivity);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load your profile activity.');
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useEffect(() => { void load(); }, [load]);
  return { data, loading, error, retry: load };
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useUser();
  const router = useRouter();
  const { data, loading, error, retry } = useProfileActivity(user?.uid);
  const [copied, setCopied] = useState(false);
  const [shareError, setShareError] = useState('');

  const shareProfile = async () => {
    if (!data?.profile.username || !data.profile.isProfilePublic) return;
    const url = `${window.location.origin}/u/${encodeURIComponent(data.profile.username)}`;
    try {
      if (navigator.share) await navigator.share({ title: `${data.profile.username} on DevRann`, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      setShareError('Unable to share your profile. Copy the profile URL from your browser.');
    }
  };

  if (authLoading || loading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-border p-8 text-center">
        <p className="text-sm text-muted-foreground">{error || 'Profile activity is unavailable.'}</p>
        <Button className="mt-4" variant="outline" onClick={() => void retry()}>Retry</Button>
      </div>
    );
  }

  const { profile, practice } = data;
  const displayName = profile.username || user?.displayName || 'Coder';
  const initials = displayName.slice(0, 2).toUpperCase();
  const games = profile.wins + profile.losses + profile.draws;
  const winRate = games ? Math.round((profile.wins / games) * 100) : null;
  const strongestTopics = Object.entries(practice.topics)
    .sort(([, a], [, b]) => b.solved - a.solved)
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="overflow-hidden border-primary/20 bg-primary/[0.03]">
        <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
          <Avatar className="h-20 w-20 border-2 border-primary/30">
            <AvatarImage src={profile.photoURL || user?.photoURL || ''} alt={`${displayName} avatar`} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{displayName}</h1>
              {profile.rating !== null && <Badge variant="outline"><Medal className="mr-1 h-3 w-3" />{profile.rating} rating</Badge>}
            </div>
            {profile.bio && <p className="max-w-2xl text-sm text-muted-foreground">{profile.bio}</p>}
            {profile.interests.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile.interests.slice(0, 8).map((interest) => <Badge key={interest} variant="secondary">{interest}</Badge>)}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push('/settings')}>Edit profile</Button>
            {profile.isProfilePublic && (
              <Button variant="outline" size="icon" aria-label="Share profile" onClick={() => void shareProfile()}>
                {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
              </Button>
            )}
          </div>
          {shareError && <p role="status" className="text-xs text-destructive">{shareError}</p>}
        </CardContent>
      </Card>

      <section aria-label="Verified coding and match statistics" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Problems solved" value={practice.solved} icon={<Target className="h-4 w-4" />} />
        <StatCard label="Submissions" value={practice.submissions} icon={<Code2 className="h-4 w-4" />} />
        <StatCard label="Matches played" value={games} icon={<Trophy className="h-4 w-4" />} />
        <StatCard label="Current streak" value={`${calculateSubmissionStreak(data.activity)} days`} icon={<Flame className="h-4 w-4" />} />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />Coding activity</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {(['Easy', 'Medium', 'Hard'] as const).map((difficulty) => (
                <div key={difficulty} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex justify-between text-sm"><span>{difficulty}</span><strong>{practice.difficulty[difficulty]}</strong></div>
                  <Progress value={practice.solved ? practice.difficulty[difficulty] / practice.solved * 100 : 0} />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Daily submission activity in the last year">
              {Object.entries(data.activity).sort(([a], [b]) => a.localeCompare(b)).slice(-84).map(([date, count]) => (
                <span key={date} title={`${date}: ${count} submissions`} className="h-3 w-3 rounded-sm bg-primary" style={{ opacity: Math.min(1, 0.2 + count / 5) }} />
              ))}
              {Object.keys(data.activity).length === 0 && <p className="text-sm text-muted-foreground">No submissions in the last year.</p>}
            </div>
            {data.activityTruncated && <p className="text-xs text-muted-foreground">The activity calendar is capped at the most recent 2,000 submissions in this time window.</p>}
            {strongestTopics.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium">Topics with accepted solutions</h3>
                <div className="flex flex-wrap gap-2">
                  {strongestTopics.map(([topic, value]) => <Badge key={topic} variant="outline">{topic} · {value.solved}</Badge>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Competitive record</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <RecordRow label="Wins" value={profile.wins} />
            <RecordRow label="Losses" value={profile.losses} />
            <RecordRow label="Draws" value={profile.draws} />
            <RecordRow label="Win rate" value={winRate === null ? '—' : `${winRate}%`} />
            <RecordRow label="Highest rating" value={profile.highestRating ?? '—'} />
            {data.ratingHistory.length > 0 && (
              <div className="border-t border-border pt-3">
                <h3 className="mb-2 text-sm font-medium">Recent rating history</h3>
                {data.ratingHistory.slice(-5).reverse().map((entry) => (
                  <div key={entry.matchId} className="flex justify-between py-1 text-xs">
                    <span>{entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : 'Match'}</span>
                    <span>{entry.rating ?? '—'} ({entry.change > 0 ? '+' : ''}{entry.change})</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent submissions</CardTitle></CardHeader>
        <CardContent>
          {data.recentSubmissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your judge-verified submissions will appear here.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.recentSubmissions.map((submission) => (
                <div key={submission.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <span className={submission.verdict === 'Accepted' ? 'text-emerald-400' : 'text-muted-foreground'}>{submission.verdict}</span>
                  <span className="font-mono text-xs">{submission.problemId}</span>
                  <span className="text-muted-foreground">{submission.language}</span>
                  {submission.executionTimeMs !== undefined && <span className="text-xs text-muted-foreground">{submission.executionTimeMs} ms</span>}
                  <span className="ml-auto text-xs text-muted-foreground">{submission.submittedAt ? new Date(submission.submittedAt).toLocaleString() : '—'}</span>
                  <Button size="sm" variant="ghost" onClick={() => router.push(`/practice?problem=${encodeURIComponent(submission.problemId)}`)}>
                    Problem <ArrowUpRight className="ml-1 h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent matches</CardTitle></CardHeader>
        <CardContent>
          {data.matchHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Completed matches will appear here.</p>
          ) : (
            <div className="divide-y divide-border">
              {data.matchHistory.map((match) => (
                <div key={match.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                  <Badge variant="outline">{match.result}</Badge>
                  <span>vs. {match.opponent}</span>
                  <span className="text-muted-foreground">{match.problemTitle}</span>
                  {match.ratingChange !== null && <span className="ml-auto text-xs">{match.ratingChange > 0 ? '+' : ''}{match.ratingChange} rating</span>}
                  <span className="text-xs text-muted-foreground">{match.timestamp ? new Date(match.timestamp).toLocaleDateString() : '—'}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>
        <span className="text-primary">{icon}</span>
      </CardContent>
    </Card>
  );
}

function RecordRow({ label, value }: { label: string; value: string | number }) {
  return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><strong>{value}</strong></div>;
}
