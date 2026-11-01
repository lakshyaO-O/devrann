'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Shell } from '@/components/layout/Shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AlertCircle, Code2, Eye, Filter, Heart, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { useUser } from '@/firebase/auth/use-user';

interface Project {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  username: string;
  photoURL: string;
  likes: number;
  views: number;
  createdAt: string | null;
}

export default function ProjectsPage() {
  const { user, loading: authLoading } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<'explore' | 'mine'>('explore');
  const [search, setSearch] = useState('');
  const [techFilter, setTechFilter] = useState('All');
  const [sortBy, setSortBy] = useState<'popular' | 'recent'>('recent');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [refreshNumber, setRefreshNumber] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      if (authLoading) return;
      if (tab === 'mine' && !user) {
        setProjects([]);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const headers: HeadersInit = {};
        let query = '';
        if (tab === 'mine' && user) {
          headers.Authorization = `Bearer ${await user.getIdToken()}`;
          query = `?userId=${encodeURIComponent(user.uid)}`;
        }
        const response = await fetch(`/api/projects${query}`, { headers, cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load projects.');
        if (active) setProjects(Array.isArray(data.projects) ? data.projects : []);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Unable to load projects.');
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProjects();
    return () => { active = false; };
  }, [authLoading, user, tab, refreshNumber]);

  const technologies = useMemo(() =>
    [...new Set(projects.flatMap((project) => project.technologies))].sort(),
  [projects]);

  const visibleProjects = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects
      .filter((project) => techFilter === 'All' || project.technologies.some((tech) => tech.toLowerCase() === techFilter.toLowerCase()))
      .filter((project) => !term || `${project.title} ${project.description} ${project.technologies.join(' ')}`.toLowerCase().includes(term))
      .sort((a, b) => sortBy === 'popular'
        ? b.likes - a.likes
        : (b.createdAt ? new Date(b.createdAt).getTime() : 0) - (a.createdAt ? new Date(a.createdAt).getTime() : 0));
  }, [projects, search, techFilter, sortBy]);

  const handleCreated = (project: Project) => {
    setProjects((current) => [project, ...current]);
    setTab('mine');
    setDialogOpen(false);
  };

  return (
    <Shell>
      <div className="space-y-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-headline font-bold text-foreground">Projects</h1>
            <p className="text-muted-foreground">Explore projects submitted by DevRann members.</p>
          </div>
          {user && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Add Project</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader><DialogTitle>Share a project</DialogTitle></DialogHeader>
                <AddProjectForm user={user} onCreated={handleCreated} />
              </DialogContent>
            </Dialog>
          )}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Button variant={tab === 'explore' ? 'default' : 'outline'} size="sm" onClick={() => setTab('explore')}>Explore</Button>
            <Button variant={tab === 'mine' ? 'default' : 'outline'} size="sm" onClick={() => setTab('mine')}>My projects</Button>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input aria-label="Search projects" placeholder="Search projects..." className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Button size="sm" variant={techFilter === 'All' ? 'secondary' : 'ghost'} onClick={() => setTechFilter('All')}>All technologies</Button>
          {technologies.map((technology) => (
            <Button key={technology} size="sm" variant={techFilter === technology ? 'secondary' : 'ghost'} onClick={() => setTechFilter(technology)}>
              {technology}
            </Button>
          ))}
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant={sortBy === 'recent' ? 'secondary' : 'ghost'} onClick={() => setSortBy('recent')}>Recent</Button>
            <Button size="sm" variant={sortBy === 'popular' ? 'secondary' : 'ghost'} onClick={() => setSortBy('popular')}>Popular</Button>
          </div>
        </div>

        {error && (
          <Card role="alert" className="border-destructive/40">
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <span className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{error}</span>
              <Button size="sm" variant="outline" onClick={() => setRefreshNumber((current) => current + 1)}>
                <RefreshCw className="mr-2 h-3 w-3" /> Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => <Card key={index} className="h-64 animate-pulse bg-muted/30" />)}
          </div>
        ) : !user && tab === 'mine' ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Sign in to view your projects.</CardContent></Card>
        ) : visibleProjects.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-10 text-center">
              <Code2 className="mx-auto h-8 w-8 text-muted-foreground" />
              <h2 className="font-semibold">{tab === 'mine' ? 'You have not shared a project yet' : 'No projects found'}</h2>
              <p className="text-sm text-muted-foreground">
                {tab === 'mine' ? 'Share your work to see it listed here.' : 'Try another search or check back when community members share projects.'}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visibleProjects.map((project) => (
              <Link key={project.id} href={`/projects/${project.id}`} className="block h-full">
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="flex h-full flex-col p-5">
                    <div className="mb-4 flex h-28 items-center justify-center rounded-lg bg-muted/40">
                      <Code2 className="h-10 w-10 text-muted-foreground/50" />
                    </div>
                    <h2 className="text-lg font-semibold">{project.title}</h2>
                    <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted-foreground">{project.description}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {project.technologies.slice(0, 4).map((technology) => <Badge key={technology} variant="secondary">{technology}</Badge>)}
                      {project.technologies.length > 4 && <Badge variant="outline">+{project.technologies.length - 4}</Badge>}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t pt-3">
                      <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <Avatar className="h-6 w-6"><AvatarFallback>{project.username.slice(0, 1).toUpperCase()}</AvatarFallback></Avatar>
                        <span className="truncate">{project.username}</span>
                      </span>
                      <span className="flex gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{project.likes}</span>
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{project.views}</span>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}

function AddProjectForm({ user, onCreated }: {
  user: NonNullable<ReturnType<typeof useUser>['user']>;
  onCreated: (project: Project) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const projectBody = {
      title: String(formData.get('title') || ''),
      description: String(formData.get('description') || ''),
      technologies: String(formData.get('technologies') || '').split(',').map((item) => item.trim()).filter(Boolean),
      tags: String(formData.get('tags') || '').split(',').map((item) => item.trim()).filter(Boolean),
      liveUrl: String(formData.get('liveUrl') || '').trim() || null,
      githubUrl: String(formData.get('githubUrl') || '').trim() || null,
    };

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify(projectBody),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to share project.');
      onCreated(result.project as Project);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to share project.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <Input name="title" placeholder="Project title" maxLength={100} required />
      <Textarea name="description" placeholder="Describe what you built..." maxLength={5000} required rows={5} />
      <Input name="technologies" placeholder="Technologies (comma separated)" />
      <Input name="tags" placeholder="Tags (comma separated)" />
      <Input name="liveUrl" type="url" placeholder="Live demo URL (optional)" />
      <Input name="githubUrl" type="url" placeholder="GitHub repository URL (optional)" />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitting ? 'Sharing...' : 'Share project'}
      </Button>
    </form>
  );
}
