'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  Check,
  CircleDot,
  Columns2,
  Download,
  Eye,
  FileText,
  Loader2,
  Pencil,
  Save,
  TriangleAlert,
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
// Front/back matter — preface, acknowledgments, introduction, conclusion, …
interface BookSectionData {
  id: string;
  kind: string;
  title: string;
  status: string;
  content: string | null;
}
interface BookData {
  title: string | null;
  estimatedPages: number;
  chapters: Chapter[];
  frontMatter: BookSectionData[];
  backMatter: BookSectionData[];
}

function statusVariant(status: string) {
  if (status === 'COMPLETED' || status === 'DONE') return 'success' as const;
  if (status === 'FAILED') return 'error' as const;
  if (status === 'PARTIAL') return 'warning' as const;
  return 'primary' as const;
}
function isChapterActive(status: string) {
  return status !== 'COMPLETED' && status !== 'FAILED';
}
/** Human label for a book-section kind (e.g. 'acknowledgments' → 'Acknowledgments'). */
function kindLabel(kind: string): string {
  return kind.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

// ── Live preview rendering ────────────────────────────────────────────────────
// A lightweight, client-side port of the same block-level markdown rules the PDF
// exporter uses (packages/infrastructure/src/export/html.ts), so the live preview
// matches what lands in the exported book. Headings, bullet/numbered/checkbox
// lists, paragraphs, and **bold**/*italic* inline marks.
function escHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function inlineMd(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
}
function renderMarkdownPreview(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => {
      const t = block.trim();
      if (!t) return '';
      if (t.startsWith('### ')) return `<h3>${inlineMd(escHtml(t.slice(4)))}</h3>`;
      if (t.startsWith('## ')) return `<h2>${inlineMd(escHtml(t.slice(3)))}</h2>`;
      if (t.startsWith('# ')) return `<h2>${inlineMd(escHtml(t.slice(2)))}</h2>`;
      const lines = t.split('\n');
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        const items = lines
          .map((l) => `<li>${inlineMd(escHtml(l.replace(/^\s*[-*]\s+(\[[ xX]\]\s+)?/, '')))}</li>`)
          .join('');
        return `<ul>${items}</ul>`;
      }
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
        const items = lines.map((l) => `<li>${inlineMd(escHtml(l.replace(/^\s*\d+[.)]\s+/, '')))}</li>`).join('');
        return `<ol>${items}</ol>`;
      }
      return `<p>${inlineMd(escHtml(t.replace(/\n/g, ' ')))}</p>`;
    })
    .filter(Boolean)
    .join('\n');
}

// Book-page typography for the preview — a CSS subset of the PDF exporter so the
// pane reads like a real page (Georgia serif, justified body, centered chapter
// opener, drop-cap on the first paragraph), independent of the app's theme.
const PREVIEW_STYLES = `
.book-preview { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; font-size: 15px; line-height: 1.65; }
.book-preview p { margin: 0 0 .85em; text-align: justify; hyphens: auto; }
.book-preview h2 { font-family: Georgia, serif; font-size: 18px; margin: 1.5em 0 .5em; color: #111; line-height: 1.25; }
.book-preview h3 { font-family: Georgia, serif; font-size: 15px; margin: 1.3em 0 .4em; color: #111; }
.book-preview ul, .book-preview ol { margin: 0 0 .9em; padding-left: 1.4em; }
.book-preview li { margin: 0 0 .35em; text-align: left; }
.book-preview strong { font-weight: 700; }
.book-preview em { font-style: italic; }
.book-preview .bp-eyebrow { text-align: center; text-transform: uppercase; letter-spacing: .25em; font-size: 11px; font-weight: 600; color: #8a8a8a; margin: 0 0 1em; }
.book-preview .bp-title { text-align: center; font-size: 26px; font-weight: 700; margin: 0 auto .3em; line-height: 1.2; color: #111; max-width: 18em; }
.book-preview .bp-ornament { text-align: center; color: #bbb; letter-spacing: .4em; margin: 0 0 1.4em; }
/* Drop cap only on chapters. Front/back matter (.bp-matter) has none — in the
   exported PDF, Paged.js re-wraps paragraphs during pagination and breaks the
   '.matter-ornament + p' adjacency, so the real book shows no drop cap there. */
.book-preview:not(.bp-matter) .bp-body > p:first-of-type::first-letter { float: left; font-family: Georgia, serif; font-weight: 700; font-size: 3.2em; line-height: .72; padding: .02em .1em 0 0; color: #1a1a1a; }
`;

/** Sidebar entry for a front/back-matter section. */
function SectionButton({
  section,
  on,
  onClick,
}: {
  section: BookSectionData;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group rounded-input border p-3 text-left transition-colors',
        on
          ? 'border-primary/40 bg-primary-soft'
          : 'border-border bg-surface hover:border-border-strong hover:bg-surface-hover',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">{kindLabel(section.kind)}</span>
        {section.status === 'DONE' ? (
          <Check className="ml-auto size-3.5 text-success" strokeWidth={3} />
        ) : section.status === 'FAILED' ? (
          <CircleDot className="ml-auto size-3.5 text-error" />
        ) : section.status === 'GENERATING' ? (
          <Loader2 className="ml-auto size-3.5 animate-spin text-primary" />
        ) : (
          <CircleDot className="ml-auto size-3.5 text-muted-foreground/40" />
        )}
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm font-semibold">{section.title}</p>
    </button>
  );
}

export default function EditorPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const [book, setBook] = useState<BookData | null>(null);
  // What's being edited: a chapter or a front/back-matter section.
  const [selectedRef, setSelectedRef] = useState<{ kind: 'chapter' | 'section'; id: string } | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // PDF/DOCX re-export state, driven automatically after a successful save.
  const [exportState, setExportState] = useState<'idle' | 'building' | 'ready' | 'error'>('idle');
  const [exports, setExports] = useState<Array<{ format: string; url: string | null; bookVersion: number }>>([]);
  // Editor layout: live side-by-side preview ('split'), editor only, or preview only.
  const [view, setView] = useState<'edit' | 'split' | 'preview'>('split');

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}/book`);
    if (res.status === 401) return router.push(`/login?next=/projects/${id}/editor`);
    const data = await res.json();
    setBook(data.book);
    if (data.book?.chapters?.length && !selectedRef) {
      setSelectedRef({ kind: 'chapter', id: data.book.chapters[0].id });
      setDraft(data.book.chapters[0].content ?? '');
    }
  }, [id, router, selectedRef]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the current selection (a chapter or a book section) into one
  // normalized shape the editor renders, so the center pane stays uniform.
  const allSections = book ? [...book.frontMatter, ...book.backMatter] : [];
  const selectedChapter =
    selectedRef?.kind === 'chapter' ? book?.chapters.find((c) => c.id === selectedRef.id) ?? null : null;
  const selectedSection =
    selectedRef?.kind === 'section' ? allSections.find((s) => s.id === selectedRef.id) ?? null : null;

  const selected = selectedChapter
    ? {
        kind: 'chapter' as const,
        id: selectedChapter.id,
        title: selectedChapter.title,
        subtitle: selectedChapter.promise || selectedChapter.topic,
        eyebrow: `Chapter ${selectedChapter.position + 1}`,
        status: selectedChapter.status,
        version: selectedChapter.version as number | null,
        wordTarget: selectedChapter.wordTarget as number | null,
        sections: selectedChapter.sections,
      }
    : selectedSection
      ? {
          kind: 'section' as const,
          id: selectedSection.id,
          title: selectedSection.title,
          subtitle: kindLabel(selectedSection.kind),
          eyebrow: kindLabel(selectedSection.kind),
          status: selectedSection.status,
          version: null as number | null,
          wordTarget: null as number | null,
          sections: [] as Section[],
        }
      : null;

  function selectChapter(ch: Chapter) {
    setSelectedRef({ kind: 'chapter', id: ch.id });
    setDraft(ch.content ?? '');
    setNotice(null);
  }
  function selectSection(s: BookSectionData) {
    setSelectedRef({ kind: 'section', id: s.id });
    setDraft(s.content ?? '');
    setNotice(null);
  }

  async function save() {
    if (!selected) return;
    setBusy('save');
    setNotice(null);
    try {
      const endpoint =
        selected.kind === 'chapter' ? `/api/chapters/${selected.id}` : `/api/book-sections/${selected.id}`;
      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, content: draft }),
      });
      const data = await res.json();
      if (!res.ok) setNotice({ kind: 'err', text: data.error ?? 'Save failed' });
      else {
        const versionPart = data.version ? `v${data.version} · ` : '';
        setNotice({ kind: 'ok', text: `Saved · ${versionPart}${data.wordCount} words` });
        void load();
        void reexport(); // rebuild the PDF/DOCX so the download reflects this edit
      }
    } finally {
      setBusy(null);
    }
  }

  // Enqueue a re-export and poll until an artifact at the new version is ready, so
  // the download link reflects the just-saved edit. Runs in the background — it does
  // not block the Save button.
  async function reexport() {
    setExportState('building');
    try {
      const res = await fetch('/api/exports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, format: 'both' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExportState('error');
        return;
      }
      const target = data.nextVersion as number;
      const deadline = Date.now() + 180_000; // exports can take a while for image-heavy books
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const r = await fetch(`/api/exports?projectId=${id}`);
        if (!r.ok) continue;
        const list = (await r.json()).artifacts as Array<{ format: string; url: string | null; bookVersion: number }>;
        if (list.some((a) => a.bookVersion >= target)) {
          setExports(list);
          setExportState('ready');
          return;
        }
      }
      setExportState('error'); // timed out
    } catch {
      setExportState('error');
    }
  }

  const totalWords = book?.chapters.reduce((sum, c) => sum + (c.wordCount ?? 0), 0) ?? 0;

  // ── Loading shell ─────────────────────────────────────────────────────────
  if (!book) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[1700px]">
          <Skeleton className="h-7 w-48" />
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
            <Skeleton className="h-96 rounded-card" />
            <Skeleton className="h-[28rem] rounded-card" />
          </div>
        </div>
      </AppShell>
    );
  }

  const draftWords = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  return (
    <AppShell>
      <style>{PREVIEW_STYLES}</style>
      <div className="mx-auto flex max-w-[1700px] flex-col gap-5">
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
          {/* ── Left: structure ──────────────────────────────────────────── */}
          <aside className="flex flex-col lg:sticky lg:top-20 lg:h-[calc(100vh-7rem)] lg:self-start">
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Structure
            </p>
            {/* Full-height, scrollable list: front matter → chapters → back matter. */}
            <div className="flex max-h-[60vh] flex-1 flex-col gap-4 overflow-y-auto pr-1 lg:max-h-none">
              {/* Front matter (preface, foreword, introduction, …). */}
              {book.frontMatter.length > 0 && (
                <div>
                  <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Front matter
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {book.frontMatter.map((s) => (
                      <SectionButton
                        key={s.id}
                        section={s}
                        on={selectedRef?.kind === 'section' && selectedRef.id === s.id}
                        onClick={() => selectSection(s)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Chapters. */}
              <div>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                  Chapters
                </p>
                <div className="flex flex-col gap-1.5">
                  {book.chapters.map((ch) => {
                    const on = selectedRef?.kind === 'chapter' && selectedRef.id === ch.id;
                    const pct = ch.wordTarget
                      ? Math.min(100, Math.round((ch.wordCount / ch.wordTarget) * 100))
                      : 0;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => selectChapter(ch)}
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
              </div>

              {/* Back matter (conclusion, acknowledgments, resources, …). */}
              {book.backMatter.length > 0 && (
                <div>
                  <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Back matter
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {book.backMatter.map((s) => (
                      <SectionButton
                        key={s.id}
                        section={s}
                        on={selectedRef?.kind === 'section' && selectedRef.id === s.id}
                        onClick={() => selectSection(s)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>

          {/* ── Right: editor (full remaining width) ─────────────────────── */}
          <section className="min-w-0">
            {selected ? (
              <Card className="flex flex-col p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-xl font-semibold tracking-tight">{selected.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{selected.subtitle}</p>
                  </div>
                  <Badge variant={statusVariant(selected.status)} className="shrink-0 capitalize">
                    {selected.status.toLowerCase().replace(/_/g, ' ')}
                  </Badge>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
                    {selected.kind === 'chapter' ? (
                      <>
                        <span>
                          {draftWords} / {selected.wordTarget} words
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>v{selected.version}</span>
                      </>
                    ) : (
                      <span>{draftWords} words</span>
                    )}
                  </div>
                  {/* View toggle — switch between editing, a live side-by-side preview, or preview only. */}
                  <div className="inline-flex rounded-input border border-border bg-surface p-0.5 text-xs">
                    {(['edit', 'split', 'preview'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setView(v)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 font-medium capitalize transition-colors',
                          view === v
                            ? 'bg-primary-soft text-primary'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {v === 'edit' ? (
                          <Pencil className="size-3.5" />
                        ) : v === 'split' ? (
                          <Columns2 className="size-3.5" />
                        ) : (
                          <Eye className="size-3.5" />
                        )}
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Editor + live preview. The preview re-renders from `draft` on every
                    keystroke, so the page on the right reflects the edit in real time. */}
                <div className={cn('mt-4 grid gap-4', view === 'split' && 'lg:grid-cols-2')}>
                  {view !== 'preview' && (
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={`${selected.kind === 'chapter' ? 'Chapter' : 'Section'} content (markdown)…`}
                      className="min-h-[28rem] w-full resize-y rounded-input border border-border bg-canvas/40 p-4 text-[15px] leading-relaxed outline-none transition-colors focus:border-primary"
                    />
                  )}
                  {view !== 'edit' && (
                    <div className="max-h-[44rem] min-h-[28rem] overflow-auto rounded-input border border-border bg-white p-8 shadow-inner">
                      {draft.trim() ? (
                        <div className={cn('book-preview', selected.kind === 'section' && 'bp-matter')}>
                          <p className="bp-eyebrow">{selected.eyebrow}</p>
                          <h1 className="bp-title">{selected.title}</h1>
                          <p className="bp-ornament">···</p>
                          <div
                            className="bp-body"
                            dangerouslySetInnerHTML={{ __html: renderMarkdownPreview(draft) }}
                          />
                        </div>
                      ) : (
                        <p className="py-24 text-center text-sm text-neutral-400">
                          Start typing to see your book preview update live…
                        </p>
                      )}
                    </div>
                  )}
                </div>

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

                {/* PDF/DOCX rebuild status — runs automatically after a save so the
                    download reflects the edit. */}
                {exportState !== 'idle' && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-input border border-border bg-surface px-3 py-2.5 text-sm">
                    {exportState === 'building' && (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Updating PDF &amp; DOCX with your edit…
                      </span>
                    )}
                    {exportState === 'ready' && (
                      <>
                        <span className="flex items-center gap-2 text-success">
                          <Check className="size-4" strokeWidth={3} />
                          Updated files ready
                        </span>
                        {exports
                          .filter((e) => e.url)
                          .map((e) => (
                            <Button key={e.format} asChild variant="secondary" size="sm">
                              <a href={e.url!} target="_blank" rel="noreferrer">
                                <Download className="size-4" />
                                {e.format.toUpperCase()}
                              </a>
                            </Button>
                          ))}
                      </>
                    )}
                    {exportState === 'error' && (
                      <span className="flex items-center gap-2 text-error">
                        <TriangleAlert className="size-4" />
                        Couldn’t rebuild the files — try again from the project page.
                      </span>
                    )}
                  </div>
                )}

                {selected.kind === 'chapter' && selected.sections.length > 0 && (
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
                Select a chapter or section to start editing.
              </Card>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
