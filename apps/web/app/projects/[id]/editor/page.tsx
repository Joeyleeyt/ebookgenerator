'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CircleDot,
  FileText,
  Loader2,
  Save,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { AppShell } from '../../../../components/app/AppShell.js';
import { Card } from '../../../../components/ui/card.js';
import { Button } from '../../../../components/ui/button.js';
import { Badge } from '../../../../components/ui/badge.js';
import { Skeleton } from '../../../../components/ui/skeleton.js';
import { cn } from '../../../../lib/utils.js';

interface Section {
  id: string;
  title: string;
  status: string;
  content: string | null;
}
interface Chapter {
  id: string;
  position: number;
  title: string;
  topic: string;
  promise: string;
  wordCount: number;
  wordTarget: number;
  status: string;
  version: number;
  content: string | null;
  sections: Section[];
}
interface BookData {
  title: string | null;
  estimatedPages: number;
  chapters: Chapter[];
}

function statusVariant(status: string) {
  if (status === 'COMPLETED') return 'success' as const;
  if (status === 'FAILED') return 'error' as const;
  if (status === 'PARTIAL') return 'warning' as const;
  return 'primary' as const;
}
function isChapterActive(status: string) {
  return status !== 'COMPLETED' && status !== 'FAILED';
}

export default function EditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [book, setBook] = useState<BookData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/book`);
    if (res.status === 401) return router.push(`/login?next=/projects/${id}/editor`);
    const data = await res.json();
    setBook(data.book);
    if (data.book?.chapters?.length && !selectedId) {
      setSelectedId(data.book.chapters[0].id);
      setDraft(data.book.chapters[0].content ?? '');
    }
  }, [id, router, selectedId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = book?.chapters.find((c) => c.id === selectedId) ?? null;

  function select(ch: Chapter) {
    setSelectedId(ch.id);
    setDraft(ch.content ?? '');
    setNotice(null);
  }

  async function save() {
    if (!selected) return;
    setBusy('save');
    setNotice(null);
    try {
      const res = await fetch(`/api/chapters/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, content: draft }),
      });
      const data = await res.json();
      if (!res.ok) setNotice({ kind: 'err', text: data.error ?? 'Save failed' });
      else {
        setNotice({ kind: 'ok', text: `Saved · v${data.version} · ${data.wordCount} words` });
        void load();
      }
    } finally {
      setBusy(null);
    }
  }

  async function regenerate() {
    if (!selected) return;
    setBusy('regen');
    setNotice(null);
    try {
      const res = await fetch(`/api/chapters/${selected.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, instructions: instructions || undefined }),
      });
      const data = await res.json();
      if (!res.ok) setNotice({ kind: 'err', text: data.error ?? 'Regenerate failed' });
      else
        setNotice({
          kind: 'ok',
          text: 'Regeneration queued — refresh in a moment to see the new draft.',
        });
    } finally {
      setBusy(null);
    }
  }

  const totalWords = book?.chapters.reduce((sum, c) => sum + (c.wordCount ?? 0), 0) ?? 0;

  // ── Loading shell ─────────────────────────────────────────────────────────
  if (!book) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl">
          <Skeleton className="h-7 w-48" />
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr_300px]">
            <Skeleton className="h-96 rounded-card" />
            <Skeleton className="h-[28rem] rounded-card" />
            <Skeleton className="hidden h-72 rounded-card lg:block" />
          </div>
        </div>
      </AppShell>
    );
  }

  const draftWords = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  return (
    <AppShell>
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        {/* Studio header */}
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={`/projects/${id}`}>
              <ArrowLeft className="size-4" />
              Status
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-h3 font-semibold tracking-tight">
              {book.title ?? 'Untitled book'}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline">
              <BookOpen className="size-3" />~{book.estimatedPages} pages
            </Badge>
            <Badge variant="outline" className="tabular-nums">
              {totalWords.toLocaleString()} words
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr_300px]">
          {/* ── Left: structure ──────────────────────────────────────────── */}
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Structure
            </p>
            <div className="flex flex-col gap-1.5">
              {book.chapters.map((ch) => {
                const on = ch.id === selectedId;
                const pct = ch.wordTarget
                  ? Math.min(100, Math.round((ch.wordCount / ch.wordTarget) * 100))
                  : 0;
                return (
                  <button
                    key={ch.id}
                    onClick={() => select(ch)}
                    className={cn(
                      'group rounded-input border p-3 text-left transition-colors',
                      on
                        ? 'border-primary/40 bg-primary-soft'
                        : 'border-border bg-surface hover:border-border-strong hover:bg-surface-hover',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Chapter {ch.position + 1}
                      </span>
                      {ch.status === 'COMPLETED' ? (
                        <Check className="ml-auto size-3.5 text-success" strokeWidth={3} />
                      ) : isChapterActive(ch.status) ? (
                        <Loader2 className="ml-auto size-3.5 animate-spin text-primary" />
                      ) : (
                        <CircleDot className="ml-auto size-3.5 text-error" />
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm font-semibold">{ch.title}</p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-hover">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── Center: editor ───────────────────────────────────────────── */}
          <section className="min-w-0">
            {selected ? (
              <Card className="flex flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold tracking-tight">{selected.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selected.promise || selected.topic}
                    </p>
                  </div>
                  <Badge variant={statusVariant(selected.status)} className="shrink-0 capitalize">
                    {selected.status.toLowerCase().replace(/_/g, ' ')}
                  </Badge>
                </div>

                <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                  <span>
                    {draftWords} / {selected.wordTarget} words
                  </span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>v{selected.version}</span>
                </div>

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Chapter content (markdown)…"
                  className="mt-4 min-h-[28rem] w-full resize-y rounded-input border border-border bg-canvas/40 p-4 text-[15px] leading-relaxed outline-none transition-colors focus:border-primary"
                />

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={save} disabled={busy !== null}>
                    {busy === 'save' ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                    {busy === 'save' ? 'Saving…' : 'Save edit'}
                  </Button>
                  {notice && (
                    <span
                      className={cn(
                        'text-sm',
                        notice.kind === 'ok' ? 'text-success' : 'text-error',
                      )}
                    >
                      {notice.text}
                    </span>
                  )}
                </div>

                {selected.sections.length > 0 && (
                  <div className="mt-8">
                    <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                      Sections
                    </h3>
                    <div className="flex flex-col gap-2">
                      {selected.sections.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center gap-3 rounded-input border border-border bg-surface px-3 py-2.5"
                        >
                          <FileText className="size-4 text-muted-foreground" />
                          <span className="flex-1 text-sm font-medium">{s.title}</span>
                          <Badge variant={statusVariant(s.status)} className="capitalize">
                            {s.status.toLowerCase().replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ) : (
              <Card className="grid place-items-center p-16 text-center text-sm text-muted-foreground">
                Select a chapter to start editing.
              </Card>
            )}
          </section>

          {/* ── Right: AI copilot ────────────────────────────────────────── */}
          <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-[10px] bg-primary-soft">
                  <Sparkles className="size-4 text-primary" />
                </span>
                <div>
                  <p className="text-sm font-semibold">AI Copilot</p>
                  <p className="text-xs text-muted-foreground">Rewrite this chapter</p>
                </div>
              </div>

              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Optional: how should the AI change it? e.g. “more concise, add a case study”"
                className="mt-3 min-h-20 w-full resize-y rounded-input border border-border bg-canvas/40 p-3 text-sm outline-none transition-colors focus:border-primary"
              />

              <Button
                onClick={regenerate}
                disabled={busy !== null || !selected}
                variant="secondary"
                className="mt-3 w-full"
              >
                {busy === 'regen' ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                {busy === 'regen' ? 'Queuing…' : 'Regenerate chapter'}
              </Button>
            </Card>

            <Card className="p-5">
              <p className="text-sm font-semibold">More AI actions</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Selection-scoped editing — expand, add statistics, change tone — lands with Book Studio.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {['Expand', 'Improve clarity', 'Add statistics', 'Change tone'].map((a) => (
                  <span
                    key={a}
                    className="cursor-not-allowed rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground/60"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
