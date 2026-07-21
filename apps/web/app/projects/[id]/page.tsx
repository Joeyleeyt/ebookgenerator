'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';
import { AppShell } from '../../../components/app/AppShell.js';
import { Card } from '../../../components/ui/card.js';
import { Button } from '../../../components/ui/button.js';
import { Badge } from '../../../components/ui/badge.js';
import { Progress } from '../../../components/ui/progress.js';
import { PipelineSteps, type Counters } from '../../../components/dashboard/PipelineSteps.js';
import { resolvePipeline, isTerminal } from '../../../components/dashboard/pipeline.js';
import {
  buildPipelineItems,
  type RawVideo,
  type RawChapter,
} from '../../../components/dashboard/buildPipelineItems.js';

interface Artifact {
  format: string;
  pageCount: number | null;
  url: string | null;
}

// Phases during which per-item lists are worth refreshing on each progress tick.
const VIDEO_PHASES = new Set([
  'INGESTING_CHANNEL',
  'FETCHING_VIDEO_DATA',
  'FETCHING_TRANSCRIPTS',
  'TRANSCRIBING_FALLBACK',
  'SUMMARIZING_VIDEOS',
  'ANALYZING_COMMENTS',
]);
const CHAPTER_PHASES = new Set([
  'GENERATING_OUTLINE',
  'GENERATING_CHAPTER_RESEARCH',
  'GENERATING_CHAPTERS',
  'POLISHING_BOOK',
  'ASSEMBLING',
]);
const EXPORT_PHASES = new Set(['ASSEMBLING', 'EXPORTING']);

function statusVariant(status: string) {
  if (status === 'COMPLETED') return 'success' as const;
  if (status === 'FAILED') return 'error' as const;
  if (status === 'PARTIAL') return 'warning' as const;
  return 'primary' as const;
}

export default function ProjectPipelinePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [status, setStatus] = useState<string>('…');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [busy, setBusy] = useState(false);
  const [reexportState, setReexportState] = useState<'idle' | 'building' | 'ready' | 'error'>('idle');
  const [pending, setPending] = useState<Record<string, number>>({});
  // Each fan-in barrier counts down from its total to zero, so the largest value
  // we've ever seen for a key is its total. We keep both to render "done/total".
  const [totals, setTotals] = useState<Record<string, number>>({});
  // Raw per-item data feeding the expandable sub-step detail.
  const [videos, setVideos] = useState<RawVideo[]>([]);
  const [chapters, setChapters] = useState<RawChapter[]>([]);
  const [outline, setOutline] = useState<{ title: string }[]>([]);

  const applyPending = useCallback((p?: Record<string, number> | null) => {
    if (!p) return;
    setPending(p);
    setTotals((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === 'number') next[k] = Math.max(next[k] ?? 0, v);
      }
      return next;
    });
  }, []);

  const loadArtifacts = useCallback(async () => {
    const res = await fetch(`/api/exports?projectId=${id}`);
    if (res.ok) setArtifacts((await res.json()).artifacts ?? []);
  }, [id]);

  const refreshVideos = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/videos`);
    if (!res.ok) return;
    const data = await res.json();
    setVideos(data.videos ?? []);
  }, [id]);

  const refreshChapters = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/book`);
    if (!res.ok) return;
    const data = await res.json();
    setChapters(data.book?.chapters ?? []);
    setOutline(data.book?.outline?.entries ?? []);
  }, [id]);

  const loadProject = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    if (res.status === 401) return router.push(`/login?next=/projects/${id}`);
    if (res.ok) {
      const data = await res.json();
      setStatus(data.status);
      setErrorText(data.error ?? null);
      applyPending(data.pending);
      if (data.status === 'COMPLETED') void loadArtifacts();
    }
  }, [id, router, loadArtifacts, applyPending]);

  useEffect(() => {
    void loadProject();
    void refreshVideos();
    void refreshChapters();
    const es = new EventSource(`/api/projects/${id}/events`);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.error) return;
      applyPending(payload.pending);
      if (payload.status) {
        setStatus(payload.status);
        // Refresh the per-item list for whichever phase is live so titles and
        // states track progress as videos/chapters complete.
        if (VIDEO_PHASES.has(payload.status)) void refreshVideos();
        if (CHAPTER_PHASES.has(payload.status)) void refreshChapters();
        if (EXPORT_PHASES.has(payload.status)) void loadArtifacts();
        if (payload.status === 'COMPLETED') {
          void loadArtifacts();
          void refreshVideos();
          void refreshChapters();
        }
        if (payload.status === 'FAILED') void loadProject();
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [id, loadProject, loadArtifacts, applyPending, refreshVideos, refreshChapters]);

  async function retry() {
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}/retry`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) alert(data.error ?? 'Retry failed');
      else void loadProject();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!confirm('Cancel this project? Queued work will be dropped.')) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (res.ok) void loadProject();
    } finally {
      setBusy(false);
    }
  }

  // Rebuild the PDF/DOCX from the current book. Backfills any missing recipe photos
  // and re-applies the latest layout/cover fixes, then polls until the fresh
  // artifact appears so the Download links update in place.
  async function reexport() {
    setReexportState('building');
    try {
      const res = await fetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, format: 'both' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReexportState('error');
        return;
      }
      const target = data.nextVersion as number;
      const deadline = Date.now() + 180_000; // image-heavy books take a while
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const r = await fetch(`/api/exports?projectId=${id}`);
        if (!r.ok) continue;
        const list = (await r.json()).artifacts as Array<{ bookVersion?: number }>;
        if (list.some((a) => (a.bookVersion ?? 0) >= target)) {
          await loadArtifacts();
          setReexportState('ready');
          return;
        }
      }
      setReexportState('error'); // timed out
    } catch {
      setReexportState('error');
    }
  }

  const { stages, percent } = resolvePipeline(status);
  const terminal = isTerminal(status);

  // Live "done/total" for every fan-in barrier currently reported.
  const counters: Counters = {};
  for (const [k, total] of Object.entries(totals)) {
    const remaining = pending[k];
    if (typeof remaining === 'number' && total > 0) {
      counters[k] = { done: Math.max(0, total - remaining), total };
    }
  }

  return (
    <AppShell>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/projects">
              <ArrowLeft className="size-4" />
              Projects
            </Link>
          </Button>
          <Badge variant={statusVariant(status)} className="ml-auto capitalize">
            {!terminal && status !== '…' && <Loader2 className="size-3 animate-spin" />}
            {status === '…' ? 'Loading' : status.toLowerCase().replace(/_/g, ' ')}
          </Badge>
        </div>

        <div>
          <h1 className="text-h3 font-semibold tracking-tight">
            {status === 'COMPLETED' ? 'Your book is ready' : 'Building your book'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ebookly is turning this channel's videos and audience into a finished ebook.
          </p>
        </div>

        {errorText && (
          <Card className="flex items-start gap-3 border-error/30 bg-error/5 p-4 text-sm text-error">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{errorText}</span>
          </Card>
        )}

        {/* Pipeline */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 border-b border-border px-6 py-4">
            <span className="grid size-9 place-items-center rounded-[11px] bg-primary-soft">
              <Sparkles className="size-4 text-primary" />
            </span>
            <p className="flex-1 text-sm font-semibold">Generation pipeline</p>
            <span className="text-sm font-semibold tabular-nums text-primary">{percent}%</span>
          </div>

          <div className="px-4 py-5 sm:px-6">
            <Progress value={percent} className="mb-5" />
            <PipelineSteps
              stages={stages}
              counters={counters}
              items={buildPipelineItems(videos, chapters, outline, artifacts)}
            />
          </div>
        </Card>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {status === 'FAILED' && (
            <Button onClick={retry} disabled={busy}>
              <RotateCcw className="size-4" />
              Retry failed stages
            </Button>
          )}
          {!terminal && (
            <Button variant="outline" onClick={cancel} disabled={busy}>
              <X className="size-4" />
              Cancel
            </Button>
          )}
          {status === 'COMPLETED' && (
            <Button asChild>
              <Link href={`/projects/${id}/editor`}>Open editor</Link>
            </Button>
          )}
        </div>

        {/* Downloads */}
        {artifacts.length > 0 && (
          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight">Downloads</h2>
              <div className="flex items-center gap-2">
                {reexportState === 'ready' && (
                  <span className="text-xs text-success">Rebuilt — download the fresh copy below</span>
                )}
                {reexportState === 'error' && (
                  <span className="text-xs text-error">Re-export failed — try again</span>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void reexport()}
                  disabled={reexportState === 'building'}
                  title="Rebuild the PDF/DOCX with the latest fixes and backfill any missing recipe photos"
                >
                  {reexportState === 'building' ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <RotateCcw className="size-4" />
                  )}
                  {reexportState === 'building' ? 'Rebuilding…' : 'Re-export'}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {artifacts.map((a) => (
                <Card key={a.format} className="flex items-center gap-3 p-4">
                  <span className="grid size-10 place-items-center rounded-[11px] bg-surface-hover">
                    <FileText className="size-5 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold uppercase">{a.format}</p>
                    {a.pageCount ? (
                      <p className="text-xs text-muted-foreground">{a.pageCount} pages</p>
                    ) : null}
                  </div>
                  {a.url ? (
                    <Button asChild variant="secondary" size="sm">
                      <a href={a.url} target="_blank" rel="noreferrer">
                        <Download className="size-4" />
                        Download
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">unavailable</span>
                  )}
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
