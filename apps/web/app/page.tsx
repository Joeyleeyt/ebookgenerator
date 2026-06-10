import Link from 'next/link';
import { ArrowRight, BookMarked, Radar, Sparkles, TrendingUp } from 'lucide-react';
import { Button } from '../components/ui/button.js';

const PILLARS = [
  { icon: Radar, title: 'Audience intelligence', body: 'Analyze videos and comments to learn what your audience will actually pay to read.' },
  { icon: TrendingUp, title: 'Ranked book opportunities', body: 'Get demand-scored book ideas — not guesses — straight from your channel.' },
  { icon: Sparkles, title: 'A finished 100+ page book', body: 'AI writes the manuscript; you edit, expand, and export to PDF, EPUB, DOCX, or KDP.' },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Ambient brand wash */}
      <div className="pointer-events-none absolute -top-48 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-30" />

      {/* Top bar */}
      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[11px] bg-brand-vivid shadow-glow">
            <BookMarked className="size-5 text-white" />
          </span>
          <span className="text-lg font-bold tracking-tight">Ebookly</span>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      {/* Hero */}
      <main className="relative mx-auto max-w-3xl px-6 pt-16 text-center sm:pt-24">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" />
          YouTube audience intelligence → profitable books
        </div>

        <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
          Turn your channel's audience into a{' '}
          <span className="text-gradient">book they'll buy.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Ebookly analyzes your videos and audience comments, surfaces the book opportunities with
          real demand, then writes a professional 100+ page ebook you can edit and export.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/dashboard">
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>

        {/* Pillars */}
        <div className="mt-20 grid gap-4 text-left sm:grid-cols-3">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="rounded-card border border-border bg-surface p-5 shadow-soft">
                <span className="grid size-9 place-items-center rounded-[11px] bg-primary-soft">
                  <Icon className="size-4 text-primary" />
                </span>
                <h3 className="mt-3 text-sm font-semibold">{p.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{p.body}</p>
              </div>
            );
          })}
        </div>
      </main>

      <div className="h-24" />
    </div>
  );
}
