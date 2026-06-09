'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '../../../components/DashboardShell.js';
import { ui, colors, statusColor } from '../../ui.js';

const STAGES = [
  'CREATED',
  'INGESTING_CHANNEL',
  'FETCHING_VIDEO_DATA',
  'FETCHING_TRANSCRIPTS',
  'TRANSCRIBING_FALLBACK',
  'SUMMARIZING_VIDEOS',
  'ANALYZING_COMMENTS',
  'BUILDING_KNOWLEDGE_BASE',
  'GENERATING_BOOK_STRATEGY',
  'GENERATING_OUTLINE',
  'GENERATING_CHAPTER_RESEARCH',
  'GENERATING_CHAPTERS',
  'POLISHING_BOOK',
  'ASSEMBLING',
  'EXPORTING',
  'COMPLETED',
];

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
      if (data.status === 'COMPLETED') void loadArtifacts();
    }
  }, [id, router, loadArtifacts]);

  useEffect(() => {
    void loadProject();
    const es = new EventSource(`/api/projects/${id}/events`);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.error) return;
      if (payload.status) {
        setStatus(payload.status);
        if (payload.status === 'COMPLETED') void loadArtifacts();
        if (payload.status === 'FAILED') void loadProject();
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [id, loadProject, loadArtifacts]);

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

  const currentIdx = STAGES.indexOf(status);
  const terminal = status === 'COMPLETED' || status === 'FAILED' || status === 'PARTIAL';

  return (
    <DashboardShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/projects" style={ui.link}>
          ← Projects
        </Link>
        <span style={{ ...ui.badge, marginLeft: 'auto', color: statusColor(status) }}>{status}</span>
      </div>

      <h1 style={{ marginTop: 16, fontSize: 26 }}>Generation pipeline</h1>

      {errorText && (
        <div style={{ marginTop: 12, padding: 14, borderRadius: 12, border: '1px solid #5b2330', background: '#1f1418', color: colors.red }}>
          {errorText}
        </div>
      )}

      <div style={{ ...ui.panel, marginTop: 24 }}>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {STAGES.map((stage, i) => {
            const done = currentIdx > i || status === 'COMPLETED';
            const active = currentIdx === i && status !== 'COMPLETED';
            return (
              <li key={stage} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '9px 0', opacity: done || active ? 1 : 0.4 }}>
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
                  {done ? '✓' : active ? '▸' : '○'}
                </span>
                <span style={{ fontWeight: active ? 700 : 400, color: active ? colors.text : undefined }}>
                  {stage.replace(/_/g, ' ').toLowerCase()}
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
