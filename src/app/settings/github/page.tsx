'use client';

import { Shell } from '@/components/layout/Shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AlertCircle, Github, GitFork, Loader2, RefreshCw, Star } from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';

interface GitHubRepository {
  name: string;
  description: string;
  url: string;
  language: string;
  stars: number;
  forks: number;
  updatedAt: string;
}

interface GitHubIntegration {
  connected?: boolean;
  githubUsername?: string;
  repos?: GitHubRepository[];
  lastSynced?: string;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
}

export default function GithubSettingsPage() {
  const { user, loading: authLoading } = useUser();
  const { data, loading, error } = useDoc(
    user ? `users/${user.uid}/github/integration` : null,
  );
  const integration = data as GitHubIntegration | null;
  const repos = Array.isArray(integration?.repos) ? integration.repos : [];

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-headline font-bold text-foreground">GitHub</h1>
          <p className="text-muted-foreground">Repository details shown here come from your saved GitHub integration.</p>
        </div>

        {authLoading || loading ? (
          <div className="flex min-h-48 items-center justify-center" aria-label="Loading GitHub integration">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !user ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Github className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h2 className="font-semibold">Sign in to view your GitHub integration</h2>
            </CardContent>
          </Card>
        ) : error ? (
          <Card role="alert" className="border-destructive/40">
            <CardContent className="flex items-center gap-3 p-5 text-sm text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              Unable to read your GitHub integration. Check your connection and reload this page.
            </CardContent>
          </Card>
        ) : !integration?.connected ? (
          <Card>
            <CardContent className="space-y-3 p-8 text-center">
              <Github className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="font-semibold">No GitHub account connected</h2>
              <p className="mx-auto max-w-lg text-sm text-muted-foreground">
                Repository sync is not available yet. This page will show repositories after a GitHub OAuth connection is completed; it will not display sample accounts or pretend to sync.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback><Github className="h-5 w-5" /></AvatarFallback>
                  </Avatar>
                  <div>
                    <h2 className="font-semibold">{integration.githubUsername || 'GitHub account'}</h2>
                    <p className="text-sm text-muted-foreground">
                      {repos.length} saved repositories
                      {integration.lastSynced ? ` · Last synced ${formatUpdatedAt(integration.lastSynced)}` : ''}
                    </p>
                  </div>
                </div>
                <Badge variant="outline">Connected</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Github className="h-4 w-4" /> Repositories
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {repos.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">No repositories have been saved from GitHub yet.</p>
                ) : repos.map((repo) => (
                  <div key={repo.url || repo.name} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      {repo.url ? (
                        <a className="font-medium hover:text-primary" href={repo.url} target="_blank" rel="noopener noreferrer">
                          {repo.name}
                        </a>
                      ) : (
                        <p className="font-medium">{repo.name}</p>
                      )}
                      <p className="mt-1 text-sm text-muted-foreground">{repo.description || 'No description provided.'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        {repo.language && <span>{repo.language}</span>}
                        <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" />{repo.stars}</span>
                        <span className="inline-flex items-center gap-1"><GitFork className="h-3 w-3" />{repo.forks}</span>
                        <span>Updated {formatUpdatedAt(repo.updatedAt)}</span>
                      </div>
                    </div>
                    {repo.url && (
                      <Button asChild size="sm" variant="outline">
                        <a href={repo.url} target="_blank" rel="noopener noreferrer">
                          <RefreshCw className="mr-2 h-3 w-3" /> View on GitHub
                        </a>
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Shell>
  );
}
