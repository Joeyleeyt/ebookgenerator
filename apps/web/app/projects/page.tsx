'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '../../components/DashboardShell.js';
import { AreaChart } from '../../components/AreaChart.js';
import { Spinner } from '../../components/Spinner.js';
import { createSupabaseBrowserClient } from '../../lib/supabase-browser.js';
import { ui, colors, accentGradient, statusColor } from '../ui.js';

interface ProjectItem {
  id: string;
  channelUrl: string;
  status: string;
  createdAt: string;
}

type Tab = 'all' | 'active' | 'completed';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** A project still moving through the pipeline (not done and not failed). */
function isActive(status: string): boolean {
  return status !== 'COMPLETED' && status !== 'FAILED';
}

function prettyChannel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?youtube\.com\//, '').replace(/^@/, '@') || url;
}

/** Cumulative ebooks-created curve over the project history (demo curve when sparse). */
function buildSeries(projects: ProjectItem[]): { data: number[]; labels: string[] } {
  const N = 7;
  if (projects.length < 2) {
    return {
      data: [2, 3, 3, 5, 4, 6, 7],
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    };
  }
  const times = projects.map((p) => new Date(p.createdAt).getTime()).sort((a, b) => a - b);
  const min = times[0]!;
  const span = Math.max(1, times[times.length - 1]! - min);
  const data: number[] = [];
  const labels: string[] = [];
  for (let i = 1; i <= N; i++) {
    const cutoff = min + (span * i) / N;
    data.push(times.filter((t) => t <= cutoff).length);
    labels.push(new Date(cutoff).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  }
  return { data, labels };
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [email, setEmail] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/projects');
    if (res.status === 401) return router.push('/login?next=/projects');
    const data = await res.json();
    setProjects(data.projects ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    void createSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: url, options: { targetPages: 10, maxVideos: 10 } }),
      });
      const data = await res.json();
      if (!res.ok) return setErrorMsg(data.error ?? 'Failed to create project');
      router.push(`/projects/${data.projectId}`);
    } finally {
      setSubmitting(false);
    }
  }

  const completed = projects.filter((p) => p.status === 'COMPLETED').length;
  const active = projects.filter((p) => p.status !== 'COMPLETED' && p.status !== 'FAILED').length;
  const series = buildSeries(projects);

  const filtered = projects.filter((p) =>
    tab === 'all' ? true : tab === 'completed' ? p.status === 'COMPLETED' : p.status !== 'COMPLETED' && p.status !== 'FAILED',
  );

  const rightRail = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Profile card */}
      <div style={{ ...ui.panel, textAlign: 'center', paddingTop: 28 }}>
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: '50%',
            margin: '0 auto 14px',
            background: accentGradient,
            display: 'grid',
            placeItems: 'center',
            fontSize: 30,
          }}
        >
          📚
        </div>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{email ?? 'Your workspace'}</div>
        <div style={{ color: colors.textDim, fontSize: 13, marginTop: 2 }}>Ebook Creator</div>
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 20, paddingTop: 20, borderTop: `1px solid ${colors.borderSoft}` }}>
          {[
            ['Projects', projects.length],
            ['Completed', completed],
            ['Active', active],
          ].map(([label, value]) => (
            <div key={label as string}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{value}</div>
              <div style={{ color: colors.textDim, fontSize: 12 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Ebooks-generated chart */}
      <div style={ui.panel}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <strong style={{ fontSize: 15 }}>Ebooks Generated</strong>
          <span
            style={{
              marginLeft: 'auto',
              ...ui.badge,
              padding: '6px 10px',
              border: `1px solid ${colors.border}`,
              background: colors.panelRaised,
            }}
          >
            30 Days ▾
          </span>
        </div>
        <AreaChart data={series.data} xLabels={series.labels} height={160} />
      </div>

      {/* Activity feed */}
      <div style={ui.panel}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <strong>Recent Activity</strong>
          <span style={{ ...ui.link, marginLeft: 'auto', fontSize: 13, cursor: 'pointer' }}>View All</span>
        </div>
        {projects.length === 0 ? (
          <p style={{ color: colors.textDim, fontSize: 14 }}>No activity yet.</p>
        ) : (
          projects.slice(0, 6).map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="row-hover"
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', margin: '0 -8px', textDecoration: 'none', color: 'inherit' }}
            >
              <span
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: colors.panelRaised,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                🎬
              </span>
              <span style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {prettyChannel(p.channelUrl)}
                </div>
                <div style={{ fontSize: 12, color: colors.textFaint }}>{timeAgo(p.createdAt)}</div>
              </span>
              <span style={{ ...ui.badge, color: statusColor(p.status), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {isActive(p.status) && <Spinner size={11} color={statusColor(p.status)} />}
                {p.status}
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );

  return (
    <DashboardShell rightRail={rightRail}>
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>Dashboard</h1>
        <p style={{ color: colors.textDim, margin: '6px 0 0' }}>Turn a YouTube channel into a ~100-page ebook.</p>
      </div>

      {/* Create form */}
      <form onSubmit={createProject} style={{ display: 'flex', gap: 10, marginTop: 24, maxWidth: 620 }}>
        <input
          style={ui.input}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/@channel"
          required
        />
        <button
          style={{ ...ui.button, display: 'inline-flex', alignItems: 'center', gap: 8 }}
          type="submit"
          disabled={submitting}
        >
          {submitting && <Spinner size={14} color="#fff" />}
          {submitting ? 'Generating…' : 'Generate'}
        </button>
      </form>
      {errorMsg && <p style={{ color: colors.red, marginTop: 12 }}>{errorMsg}</p>}

      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 32, borderBottom: `1px solid ${colors.borderSoft}` }}>
        {(
          [
            ['all', 'All Projects'],
            ['active', 'In Progress'],
            ['completed', 'Completed'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              background: 'none',
              border: 0,
              padding: '0 0 12px',
              cursor: 'pointer',
              fontSize: 15,
              fontWeight: 600,
              color: tab === key ? colors.text : colors.textDim,
              borderBottom: `2px solid ${tab === key ? colors.pink : 'transparent'}`,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Project grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 18, marginTop: 24 }}>
        {loading ? (
          <p style={{ color: colors.textDim, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Spinner /> Loading…
          </p>
        ) : filtered.length === 0 ? (
          <div
            style={{
              gridColumn: '1 / -1',
              ...ui.panel,
              textAlign: 'center',
              padding: '48px 24px',
              color: colors.textDim,
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>📚</div>
            <div style={{ fontWeight: 600, color: colors.text, marginBottom: 4 }}>No projects here yet</div>
            Paste a channel URL above to create your first ebook.
          </div>
        ) : (
          filtered.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="panel-card"
              style={{
                display: 'block',
                borderRadius: 16,
                border: `1px solid ${colors.border}`,
                background: colors.panel,
                textDecoration: 'none',
                color: 'inherit',
                overflow: 'hidden',
                boxShadow: '0 1px 2px var(--c-shadow-soft)',
              }}
            >
              <div style={{ position: 'relative', height: 112, background: accentGradient, display: 'grid', placeItems: 'center' }}>
                <span style={{ fontSize: 42, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.3))' }}>📖</span>
                <span
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    ...ui.badge,
                    background: 'rgba(0, 0, 0, 0.4)',
                    color: '#fff',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {isActive(p.status) && <Spinner size={10} color="#fff" />}
                  {p.status}
                </span>
              </div>
              <div style={{ padding: 16 }}>
                <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {prettyChannel(p.channelUrl)}
                </strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.textFaint, fontSize: 13, marginTop: 10 }}>
                  <span>🕑</span>
                  {timeAgo(p.createdAt)}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
