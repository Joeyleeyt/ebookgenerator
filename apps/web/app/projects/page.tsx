'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SignOutButton } from '../../components/SignOutButton.js';
import { DashboardShell } from '../../components/DashboardShell.js';
import { AreaChart } from '../../components/AreaChart.js';
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
        body: JSON.stringify({ channelUrl: url, options: { targetPages: 100 } }),
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
        <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 20 }}>
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

      {/* Activity feed */}
      <div style={ui.panel}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <strong>Recent Activity</strong>
          <span style={{ ...ui.link, marginLeft: 'auto', fontSize: 13 }}>View All</span>
        </div>
        {projects.length === 0 ? (
          <p style={{ color: colors.textDim, fontSize: 14 }}>No activity yet.</p>
        ) : (
          projects.slice(0, 6).map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', textDecoration: 'none', color: 'inherit' }}
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
              <span style={{ ...ui.badge, color: statusColor(p.status) }}>{p.status}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );

  return (
    <DashboardShell rightRail={rightRail} actions={<SignOutButton />}>
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 26 }}>Dashboard</h1>
        <p style={{ color: colors.textDim, margin: '6px 0 0' }}>Turn a YouTube channel into a ~100-page ebook.</p>
      </div>

      {/* Chart panel */}
      <div style={{ ...ui.panel, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <strong style={{ fontSize: 16 }}>Ebooks Generated</strong>
          <span
            style={{
              marginLeft: 'auto',
              ...ui.badge,
              padding: '8px 14px',
              border: `1px solid ${colors.border}`,
              background: colors.panelRaised,
            }}
          >
            Last 30 Days ▾
          </span>
        </div>
        <AreaChart data={series.data} xLabels={series.labels} />
      </div>

      {/* Create form */}
      <form onSubmit={createProject} style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        <input
          style={ui.input}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/@channel"
          required
        />
        <button style={ui.button} type="submit" disabled={submitting}>
          {submitting ? '…' : 'Generate'}
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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16, marginTop: 24 }}>
        {loading ? (
          <p style={{ color: colors.textDim }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p style={{ color: colors.textDim }}>No projects here yet. Paste a channel URL above to create your first ebook.</p>
        ) : (
          filtered.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              style={{
                display: 'block',
                borderRadius: 16,
                border: `1px solid ${colors.border}`,
                background: colors.panel,
                textDecoration: 'none',
                color: 'inherit',
                overflow: 'hidden',
              }}
            >
              <div style={{ height: 120, background: accentGradient, display: 'grid', placeItems: 'center', fontSize: 40, opacity: 0.92 }}>
                📖
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {prettyChannel(p.channelUrl)}
                  </strong>
                  <span style={{ ...ui.badge, color: statusColor(p.status) }}>{p.status}</span>
                </div>
                <div style={{ color: colors.textFaint, fontSize: 13, marginTop: 8 }}>{timeAgo(p.createdAt)}</div>
              </div>
            </Link>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
