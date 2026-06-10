'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
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
import { resolvePipeline, isTerminal } from '../../../components/dashboard/pipeline.js';
import { cn } from '../../../lib/utils.js';

// Backend statuses that run under the per-video pipeline barrier — while the
// project rests on any of these, we surface a live "N/total videos" counter on
// the active premium stage.
const PER_VIDEO = new Set([
  'FETCHING_VIDEO_DATA',
  'FETCHING_TRANSCRIPTS',
  'TRANSCRIBING_FALLBACK',
  'SUMMARIZING_VIDEOS',
  'ANALYZING_COMMENTS',
]);

interface Artifact {
  format: string;
  pageCount: number | null;
  url: string | null;
}

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
  const [pending, setPending] = useState<Record<string, number>>({});
  // The VIDEO_PIPELINE barrier starts at the video count and counts down, so the
  // largest remaining value we've seen is the total.
  const [videoTotal, setVideoTotal] = useState<number | null>(null);

  const applyPending = useCallback((p?: Record<string, number> | null) => {
    if (!p) return;
    setPending(p);
    const remaining = p.VIDEO_PIPELINE;
    if (typeof remaining === 'number') {
      setVideoTotal((t) => (t === null ? remaining : Math.max(t, remaining)));
    }
  }, []);

  const loadArtifacts = useCallback(async () => {
    const res = await fetch(`/api/exports?projectId=${id}`);
    if (res.ok) setArtifacts((await res.json()).artifacts ?? []);
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
    const es = new EventSource(`/api/projects/${id}/events`);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.error) return;
      applyPending(payload.pending);
      if (payload.status) {
        setStatus(payload.status);
        if (payload.status === 'COMPLETED') void loadArtifacts();
        if (payload.status === 'FAILED') void loadProject();
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [id, loadProject, loadArtifacts, applyPending]);

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

  const { stages, percent } = resolvePipeline(status);
  const terminal = isTerminal(status);
  const videoRemaining = pending.VIDEO_PIPELINE;
  const showVideoCount =
    PER_VIDEO.has(status) && videoTotal !== null && typeof videoRemaining === 'number';
  const videoDone = showVideoCount ? Math.max(0, (videoTotal as number) - videoRemaining) : 0;

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

          <div className="px-6 py-5">
            <Progress value={percent} className="mb-5" />
            <ol className="flex flex-col gap-0.5">
              {stages.map((s, i) => (
                <motion.li
                  key={s.label}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className={cn(
                    'flex items-center gap-3 rounded-input px-2 py-2.5 text-sm',
                    s.state === 'active' && 'bg-surface-hover',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-5 shrink-0 place-items-center rounded-full',
                      s.state === 'done' && 'bg-success text-white',
                      s.state === 'active' && 'bg-primary-soft text-primary animate-pulse-ring',
                      s.state === 'pending' && 'border border-border text-transparent',
                    )}
                  >
                    {s.state === 'done' ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : s.state === 'active' ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : null}
                  </span>
                  <span
                    className={cn(
                      'flex-1',
                      s.state === 'pending' ? 'text-muted-foreground' : 'text-foreground',
                      s.state === 'active' && 'font-medium',
                    )}
                  >
                    {s.label}
                  </span>
                  {showVideoCount && s.state === 'active' && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {videoDone}/{videoTotal} videos
                    </span>
                  )}
                </motion.li>
              ))}
            </ol>
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
            <h2 className="mb-3 text-base font-semibold tracking-tight">Downloads</h2>
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
