'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '../../../../components/DashboardShell.js';
import { Spinner } from '../../../../components/Spinner.js';
import { ui, colors, statusColor } from '../../../ui.js';

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

export default function EditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [book, setBook] = useState<BookData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [instructions, setInstructions] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
      if (!res.ok) setNotice(data.error ?? 'Save failed');
      else {
        setNotice(`Saved (v${data.version}, ${data.wordCount} words)`);
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
      if (!res.ok) setNotice(data.error ?? 'Regenerate failed');
      else setNotice('Regeneration queued — refresh in a moment to see the new draft.');
    } finally {
      setBusy(null);
    }
  }

  if (!book) {
    return (
      <DashboardShell>
        <Link href={`/projects/${id}`} style={ui.link}>
          ← Status
        </Link>
        <p style={{ opacity: 0.6, marginTop: 24, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Spinner /> Loading book…
        </p>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href={`/projects/${id}`} style={ui.link}>
          ← Status
        </Link>
        <span style={{ marginLeft: 'auto', ...ui.badge }}>~{book.estimatedPages} pages</span>
      </div>
      <h1 style={{ marginTop: 12 }}>{book.title ?? 'Untitled book'}</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 24, marginTop: 24, alignItems: 'start' }}>
        <nav style={{ position: 'sticky', top: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: colors.textFaint, margin: '0 4px 10px' }}>
            Chapters
          </div>
          {book.chapters.map((ch) => {
            const on = ch.id === selectedId;
            return (
              <button
                key={ch.id}
                onClick={() => select(ch)}
                className="list-btn"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  marginBottom: 6,
                  borderRadius: 10,
                  border: '1px solid ' + (on ? colors.accent : colors.border),
                  background: on ? colors.accentSoft : colors.panel,
                  color: colors.text,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 13, color: colors.textDim }}>Chapter {ch.position + 1}</div>
                <div style={{ fontWeight: 600 }}>{ch.title}</div>
                <span
                  style={{
                    ...ui.badge,
                    color: statusColor(ch.status),
                    marginTop: 6,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {ch.status !== 'COMPLETED' && ch.status !== 'FAILED' && <Spinner size={10} color={statusColor(ch.status)} />}
                  {ch.status}
                </span>
              </button>
            );
          })}
        </nav>

        <section style={ui.panel}>
          {selected ? (
            <>
              <h2 style={{ marginTop: 0, marginBottom: 4 }}>{selected.title}</h2>
              <p style={{ color: colors.textDim, marginTop: 0 }}>{selected.promise || selected.topic}</p>
              <p style={{ fontSize: 13, color: colors.textFaint }}>
                {selected.wordCount} / {selected.wordTarget} words · v{selected.version}
              </p>

              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                style={{ ...ui.input, minHeight: 360, fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }}
                placeholder="Chapter content (markdown)…"
              />

              <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  style={{ ...ui.button, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  onClick={save}
                  disabled={busy !== null}
                >
                  {busy === 'save' && <Spinner size={14} color="#fff" />}
                  {busy === 'save' ? 'Saving…' : 'Save edit'}
                </button>
                <button
                  style={{ ...ui.buttonGhost, display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  onClick={regenerate}
                  disabled={busy !== null}
                >
                  {busy === 'regen' && <Spinner size={14} color={colors.accent} />}
                  {busy === 'regen' ? 'Queuing…' : 'Regenerate with AI'}
                </button>
              </div>
              <input
                style={{ ...ui.input, marginTop: 12 }}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Optional regeneration instructions (e.g. 'more concise, add a case study')"
              />

              {notice && <p style={{ marginTop: 12, color: colors.green }}>{notice}</p>}

              {selected.sections.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <h3>Sections</h3>
                  {selected.sections.map((s) => (
                    <div key={s.id} style={ui.card}>
                      <strong>{s.title}</strong> <span style={{ ...ui.badge, color: statusColor(s.status) }}>{s.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p style={{ opacity: 0.6 }}>Select a chapter.</p>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
