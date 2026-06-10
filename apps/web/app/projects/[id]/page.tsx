'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '../../../components/DashboardShell.js';
import { ui, colors, statusColor } from '../../ui.js';
import { Spinner } from '../../../components/Spinner.js';

// Display steps for the progress tracker. Each step maps to one or more backend
// statuses. The per-video phases (data → transcripts → whisper fallback →
// summarize → comments) all run concurrently under a single VIDEO_PIPELINE
// barrier — the project status never rests on them individually — so they're
// shown as one "processing videos" step with a live N/total counter.
const DISPLAY_STAGES: { label: string; statuses: string[] }[] = [
  { label: 'created', statuses: ['CREATED'] },
  { label: 'ingesting channel', statuses: ['INGESTING_CHANNEL'] },
  {
    label: 'processing videos',
    statuses: ['FETCHING_VIDEO_DATA', 'FETCHING_TRANSCRIPTS', 'TRANSCRIBING_FALLBACK', 'SUMMARIZING_VIDEOS', 'ANALYZING_COMMENTS'],
  },
  { label: 'building knowledge base', statuses: ['BUILDING_KNOWLEDGE_BASE'] },
  { label: 'generating book strategy', statuses: ['GENERATING_BOOK_STRATEGY'] },
  { label: 'generating outline', statuses: ['GENERATING_OUTLINE'] },
  { label: 'generating chapter research', statuses: ['GENERATING_CHAPTER_RESEARCH'] },
  { label: 'generating chapters', statuses: ['GENERATING_CHAPTERS'] },
  { label: 'polishing book', statuses: ['POLISHING_BOOK'] },
  { label: 'assembling', statuses: ['ASSEMBLING'] },
  { label: 'exporting', statuses: ['EXPORTING'] },
  { label: 'completed', statuses: ['COMPLETED'] },
];

// The display step that aggregates the per-video pipeline (carries the counter).
const VIDEO_STEP = 'FETCHING_VIDEO_DATA';

interface Artifact {
  format: string;
  pageCount: number | null;
  url: string | null;
}

export default function ProjectStatusPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [status, setStatus] = useState<string>('…');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Record<string, number>>({});
  // Total videos in the per-video pipeline. The VIDEO_PIPELINE barrier starts at
  // the video count and counts down, so the largest value we've seen is the total.
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

  const currentIdx = DISPLAY_STAGES.findIndex((s) => s.statuses.includes(status));
  const terminal = status === 'COMPLETED' || status === 'FAILED' || status === 'PARTIAL';
  const videoRemaining = pending.VIDEO_PIPELINE;

  return (
    <DashboardShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/projects" style={ui.link}>
          ← Projects
        </Link>
        <span style={{ ...ui.badge, marginLeft: 'auto', color: statusColor(status), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {!terminal && status !== '…' && <Spinner size={11} color={statusColor(status)} />}
          {status}
        </span>
      </div>

      <h1 style={{ marginTop: 16, fontSize: 26 }}>Generation pipeline</h1>

      {errorText && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 12, border: `1px solid ${colors.red}`, background: colors.redSoft, color: colors.red }}>
          {errorText}
        </div>
      )}

      <div style={{ ...ui.panel, marginTop: 24 }}>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {DISPLAY_STAGES.map((stage, i) => {
            const done = currentIdx > i || status === 'COMPLETED';
            const active = currentIdx === i && status !== 'COMPLETED';
            // Show "N/total videos" on the per-video step while it's active.
            const showCount =
              active && stage.statuses.includes(VIDEO_STEP) && videoTotal !== null && typeof videoRemaining === 'number';
            const videoDone = showCount ? Math.max(0, (videoTotal as number) - videoRemaining) : 0;
            return (
              <li key={stage.label} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 0', opacity: done || active ? 1 : 0.4 }}>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    flexShrink: 0,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 13,
                    color: done ? '#fff' : active ? colors.pink : colors.textFaint,
                    background: done ? colors.green : 'transparent',
                    border: active ? `2px solid ${colors.pink}` : done ? 'none' : `1px solid ${colors.border}`,
                  }}
                >
                  {done ? '✓' : active ? <Spinner size={14} color={colors.pink} /> : '○'}
                </span>
                <span style={{ fontWeight: active ? 700 : 400, color: active ? colors.text : undefined }}>
                  {stage.label}
                  {showCount && (
                    <span style={{ marginLeft: 8, fontWeight: 400, color: colors.textFaint }}>
                      {videoDone}/{videoTotal} videos
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
        {status === 'FAILED' && (
          <button style={ui.button} onClick={retry} disabled={busy}>
            Retry failed stages
          </button>
        )}
        {!terminal && (
          <button style={ui.buttonGhost} onClick={cancel} disabled={busy}>
            Cancel
          </button>
        )}
        {status === 'COMPLETED' && (
          <Link href={`/projects/${id}/editor`} style={{ ...ui.button, textDecoration: 'none' }}>
            Open editor
          </Link>
        )}
      </div>

      {artifacts.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 20 }}>Downloads</h2>
          {artifacts.map((a) => (
            <div key={a.format} style={ui.card}>
              <strong>{a.format.toUpperCase()}</strong>
              {a.pageCount ? <span style={{ opacity: 0.6 }}> · {a.pageCount} pages</span> : null}
              {a.url ? (
                <a href={a.url} style={{ ...ui.link, marginLeft: 12 }} target="_blank" rel="noreferrer">
                  Download
                </a>
              ) : (
                <span style={{ opacity: 0.5, marginLeft: 12 }}>unavailable</span>
              )}
            </div>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
