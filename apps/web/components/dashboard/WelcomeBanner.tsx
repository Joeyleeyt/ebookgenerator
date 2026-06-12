'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2, Sparkles, Youtube } from 'lucide-react';
import { Button } from '../ui/button.js';
import { cn } from '../../lib/utils.js';

/**
 * Command-center hero. The channel input is the product's single most important
 * action — paste a channel, AI does the rest — so it leads the page. POSTs to
 * the real /api/projects endpoint and routes into the live pipeline view.
 */
export function WelcomeBanner({ name, activeCount }: { name: string; activeCount: number }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
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
        body: JSON.stringify({ channelUrl: url, options: { targetPages: 100, maxVideos: 10 } }),
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
          {error && <p className="mt-2 text-sm text-error">{error}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            We analyze videos and audience comments, then surface book opportunities before writing.
          </p>
        </form>
      </div>
    </section>
  );
}
