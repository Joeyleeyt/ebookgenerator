'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, BookOpen, Loader2, Youtube } from 'lucide-react';
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

/** Clamp a (possibly NaN) number input to the DTO's allowed range. */
function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Mirror of the backend chapter-count formula (round(pages/7), clamped 2–14). */
function estimateChapters(pages: number): number {
  const p = Number.isFinite(pages) ? pages : 100;
  return Math.max(2, Math.min(14, Math.round(p / 7)));
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [pages, setPages] = useState(100);
  const [videos, setVideos] = useState(30);
  const [illustrations, setIllustrations] = useState(true);
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
    const trimmedTitle = title.trim();
    const trimmedUrl = url.trim();
    if (!trimmedTitle || !trimmedUrl) {
      setError(
        !trimmedTitle && !trimmedUrl
          ? 'Please enter a book title and a YouTube channel URL.'
          : !trimmedTitle
            ? 'Please enter a book title.'
            : 'Please enter a YouTube channel URL.',
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelUrl: trimmedUrl,
          options: {
            bookTitle: trimmedTitle,
            targetPages: clampInt(pages, 10, 200, 100),
            maxVideos: clampInt(videos, 5, 50, 30),
            includeIllustrations: illustrations,
          },
        }),
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
        <form onSubmit={createProject} noValidate className="flex flex-col gap-2.5">
          <div
            className={cn(
              'flex flex-col rounded-input border bg-surface transition-colors',
              error ? 'border-error' : 'border-border focus-within:border-primary',
            )}
          >
            <div className="flex items-center gap-2 border-b border-border px-3.5">
              <BookOpen className="size-5 shrink-0 text-muted-foreground" />
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Book title…"
                required
                className="h-11 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="flex items-center gap-2 p-1.5 pl-3.5">
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
            </div>
          </div>
          <div className="hidden">
            <label className="flex items-center gap-1.5">
              Pages
              <input
                type="number"
                min={10}
                max={200}
                value={Number.isFinite(pages) ? pages : ''}
                onChange={(e) => setPages(e.target.valueAsNumber)}
                className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-foreground tabular-nums outline-none focus:border-primary"
              />
            </label>
            <label className="flex items-center gap-1.5">
              Videos
              <input
                type="number"
                min={5}
                max={50}
                value={Number.isFinite(videos) ? videos : ''}
                onChange={(e) => setVideos(e.target.valueAsNumber)}
                className="w-16 rounded-md border border-border bg-surface px-2 py-1 text-foreground tabular-nums outline-none focus:border-primary"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={illustrations}
                onChange={(e) => setIllustrations(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              Illustrations
            </label>
            <span className="text-muted-foreground/70">≈ {estimateChapters(pages)} chapters</span>
          </div>
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
