'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Sparkles, Youtube } from 'lucide-react';
import { Button } from '../ui/button.js';
import { cn } from '../../lib/utils.js';

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

/**
 * Command-center hero. The channel input is the product's single most important
 * action — paste a channel, AI does the rest — so it leads the page. POSTs to
 * the real /api/projects endpoint and routes into the live pipeline view.
 */
export function WelcomeBanner({ name, activeCount }: { name: string; activeCount: number }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [pages, setPages] = useState(100);
  const [videos, setVideos] = useState(30);
  const [illustrations, setIllustrations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelUrl: url,
          options: {
            targetPages: clampInt(pages, 10, 200, 100),
            maxVideos: clampInt(videos, 5, 50, 30),
            includeIllustrations: illustrations,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not start analysis');
        return;
      }
      router.push(`/projects/${data.projectId}`);
    } catch {
      setError('Network error — please try again');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-card border border-border bg-surface p-6 sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 right-20 size-72 rounded-full bg-secondary/10 blur-3xl" />

      <div className="relative">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-hover px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          Audience intelligence → profitable books
        </div>

        <h1 className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Welcome back, {name}.{' '}
          <span className="text-muted-foreground">
            {activeCount > 0
              ? `${activeCount} ${activeCount === 1 ? 'book is' : 'books are'} being written.`
              : 'Turn a channel into a book.'}
          </span>
        </h1>

        <form onSubmit={submit} className="mt-6 max-w-xl">
          <div
            className={cn(
              'flex items-center gap-2 rounded-input border bg-canvas/60 p-1.5 pl-3.5 transition-colors',
              error ? 'border-error' : 'border-border focus-within:border-primary',
            )}
          >
            <Youtube className="size-5 shrink-0 text-error" />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste a YouTube channel URL…"
              required
              className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
              {submitting ? 'Starting…' : 'Analyze'}
            </Button>
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
          {error && <p className="mt-2 text-sm text-error">{error}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            We analyze videos and audience comments, then surface book opportunities before writing.
          </p>
        </form>
      </div>
    </section>
  );
}
