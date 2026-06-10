'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Youtube } from 'lucide-react';
import { AppShell } from '../../components/app/AppShell.js';
import { ProjectCard, type ProjectCardData } from '../../components/projects/ProjectCard.js';
import { Button } from '../../components/ui/button.js';
import { Skeleton } from '../../components/ui/skeleton.js';
import { isActiveStatus } from '../../components/dashboard/pipeline.js';
import { cn } from '../../lib/utils.js';

type Tab = 'all' | 'active' | 'completed';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All projects' },
  { key: 'active', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
];

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/projects');
    if (res.status === 401) return router.push('/login?next=/projects');
    const data = await res.json();
    setProjects(data.projects ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: url, options: { targetPages: 10, maxVideos: 10 } }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error ?? 'Could not start analysis');
      router.push(`/projects/${data.projectId}`);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  const counts = {
    all: projects.length,
    active: projects.filter((p) => isActiveStatus(p.status)).length,
    completed: projects.filter((p) => p.status === 'COMPLETED').length,
  };

  const filtered = projects.filter((p) =>
    tab === 'all' ? true : tab === 'completed' ? p.status === 'COMPLETED' : isActiveStatus(p.status),
  );

  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-h3 font-semibold tracking-tight">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Every channel you've turned into a book, and the ones in progress.
          </p>
        </div>

        {/* Create row */}
        <form
          onSubmit={createProject}
          className={cn(
            'flex items-center gap-2 rounded-input border bg-surface p-1.5 pl-3.5 transition-colors',
            error ? 'border-error' : 'border-border focus-within:border-primary',
          )}
        >
          <Youtube className="size-5 shrink-0 text-error" />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Paste a YouTube channel URL to start a new book…"
            required
            className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="sm" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            {submitting ? 'Starting…' : 'Analyze'}
          </Button>
        </form>
        {error && <p className="-mt-3 text-sm text-error">{error}</p>}

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-border">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'relative flex items-center gap-2 px-3 pb-3 pt-1 text-sm font-medium transition-colors',
                tab === t.key ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              <span className="rounded-full bg-surface-hover px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                {counts[t.key]}
              </span>
              {tab === t.key && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand-vivid" />
              )}
            </button>
          ))}
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-card" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-grid py-16 text-center">
            <div className="grid size-12 place-items-center rounded-2xl bg-surface-hover">
              <Youtube className="size-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold">
                {tab === 'all' ? 'No projects yet' : `Nothing ${tab === 'active' ? 'in progress' : 'completed'}`}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste a channel URL above to create your first ebook.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
