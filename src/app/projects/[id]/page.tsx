'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertCircle, ArrowLeft, Code2, ExternalLink, Eye, Github, Globe, Heart, Loader2, RefreshCw, Tag,
} from 'lucide-react';

interface Project {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  screenshots: string[];
  liveUrl: string | null;
  githubUrl: string | null;
  tags: string[];
  userId: string;
  username: string;
  photoURL: string;
  likes: number;
  views: number;
  createdAt: string | null;
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadProject() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load project.');
        if (active) setProject(data.project as Project);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load project.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProject();
    return () => { active = false; };
  }, [projectId, retry]);

  return (
    <Shell>
      <div className="space-y-6">
        <Button variant="ghost" asChild className="-ml-2 gap-2 text-muted-foreground">
          <Link href="/projects"><ArrowLeft className="h-4 w-4" /> Back to Projects</Link>
        </Button>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center" aria-label="Loading project">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Card role="alert" className="border-destructive/40">
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <AlertCircle className="h-7 w-7 text-destructive" />
              <p className="text-sm text-destructive">{error}</p>
              <Button variant="outline" onClick={() => setRetry((current) => current + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </CardContent>
          </Card>
        ) : !project ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Project not found.</CardContent></Card>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
            <main className="space-y-6">
              <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border bg-muted/30">
                {project.screenshots[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={project.screenshots[0]} alt={`${project.title} project screenshot`} className="max-h-[420px] w-full object-contain" />
                ) : (
                  <Code2 className="h-16 w-16 text-muted-foreground/40" />
                )}
              </div>

              <section>
                <h1 className="text-3xl font-headline font-bold">{project.title}</h1>
                <p className="mt-2 whitespace-pre-line text-muted-foreground">{project.description}</p>
                {project.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.tags.map((tag) => <Badge key={tag} variant="secondary"><Tag className="mr-1 h-3 w-3" />{tag}</Badge>)}
                  </div>
                )}
              </section>

              {project.technologies.length > 0 && (
                <section className="flex flex-wrap gap-2" aria-label="Technologies">
                  {project.technologies.map((technology) => <Badge key={technology} variant="outline">{technology}</Badge>)}
                </section>
              )}
            </main>

            <aside className="space-y-4">
              <Card>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      {project.photoURL && <AvatarImage src={project.photoURL} alt="" />}
                      <AvatarFallback>{project.username.slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{project.username}</p>
                      <p className="text-xs text-muted-foreground">Project author</p>
                    </div>
                  </div>
                  {project.userId && (
                    <Button variant="outline" className="w-full" asChild>
                      <Link href={`/profile/${encodeURIComponent(project.userId)}`}>View profile</Link>
                    </Button>
                  )}
                  <div className="flex justify-between border-t pt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{project.likes} likes</span>
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{project.views} views</span>
                  </div>
                </CardContent>
              </Card>

              {(project.liveUrl || project.githubUrl) && (
                <Card>
                  <CardContent className="space-y-3 p-5">
                    <h2 className="text-sm font-semibold">Project links</h2>
                    {project.liveUrl && (
                      <Button asChild variant="outline" className="w-full justify-start">
                        <a href={project.liveUrl} target="_blank" rel="noopener noreferrer">
                          <Globe className="mr-2 h-4 w-4" /> Live demo <ExternalLink className="ml-auto h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    {project.githubUrl && (
                      <Button asChild variant="outline" className="w-full justify-start">
                        <a href={project.githubUrl} target="_blank" rel="noopener noreferrer">
                          <Github className="mr-2 h-4 w-4" /> Source code <ExternalLink className="ml-auto h-3 w-3" />
                        </a>
                      </Button>
                    )}
                  </CardContent>
                </Card>
              )}
            </aside>
          </div>
        )}
      </div>
    </Shell>
  );
}
