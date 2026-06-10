import type { ItemMap, ItemProgress } from './PipelineSteps.js';

/**
 * Builds the per-sub-step item lists for the live pipeline, each with a
 * PHASE-SPECIFIC state derived from real backend data:
 *   - videos carry per-phase flags (transcript / whisper / summary / comments)
 *   - chapters carry their content status
 *   - outline entries and export artifacts round out the remaining sub-steps
 * Sub-steps with no meaningful per-item collection (knowledge base, book
 * strategy) simply have no key here and render as a single line.
 */

export interface RawVideo {
  id: string;
  title: string;
  position: number;
  status: string;
  hasTranscript: boolean;
  transcriptSource: string | null;
  needsWhisper: boolean;
  hasSummary: boolean;
  commentCount: number;
}

export interface RawChapter {
  id: string;
  title: string;
  position: number;
  status: string;
  wordCount: number;
  content: string | null;
}

export interface RawArtifact {
  format: string;
  pageCount: number | null;
  url: string | null;
}

function chapterState(status: string): ItemProgress['state'] {
  const u = (status ?? '').toUpperCase();
  if (u.includes('COMPLET') || u === 'DONE') return 'done';
  if (u.includes('FAIL')) return 'failed';
  if (u.includes('GENERAT') || u.includes('PROGRESS') || u.includes('POLISH')) return 'active';
  return 'pending';
}

export function buildPipelineItems(
  videos: RawVideo[],
  chapters: RawChapter[],
  outline: { title: string }[],
  artifacts: RawArtifact[],
): ItemMap {
  const vid = (v: RawVideo, state: ItemProgress['state']): ItemProgress => ({
    id: v.id,
    title: v.title || `Video ${v.position + 1}`,
    state: v.status === 'FAILED' ? 'failed' : state,
  });
  const ch = (c: RawChapter, state: ItemProgress['state']): ItemProgress => ({
    id: c.id,
    title: c.title || `Chapter ${c.position + 1}`,
    state,
  });
  const isWhisper = (v: RawVideo) => (v.transcriptSource ?? '').toLowerCase() === 'whisper';

  return {
    // Videos indexed
    'videos.discovered': videos.map((v) => vid(v, 'done')),
    'videos.data': videos.map((v) => vid(v, 'done')),
    'videos.transcripts': videos.map((v) => vid(v, v.hasTranscript ? 'done' : 'pending')),
    'videos.whisper': videos
      .filter((v) => v.needsWhisper || isWhisper(v))
      .map((v) => vid(v, isWhisper(v) ? 'done' : 'active')),
    // Audience comments analyzed
    'videos.summaries': videos.map((v) => vid(v, v.hasSummary ? 'done' : 'pending')),
    'videos.comments': videos.map((v) => vid(v, v.commentCount > 0 ? 'done' : 'pending')),
    // Outline structured
    outline: outline.map((e, i) => ({ id: `outline-${i}`, title: e.title, state: 'done' as const })),
    'chapters.research': chapters.map((c) => ch(c, c.wordCount > 0 || c.content ? 'done' : 'pending')),
    // Chapters written / polished / assembled
    'chapters.write': chapters.map((c) => ch(c, chapterState(c.status))),
    'chapters.polish': chapters.map((c) => ch(c, chapterState(c.status))),
    'chapters.assemble': chapters.map((c) => ch(c, chapterState(c.status))),
    // Export ready
    exports: artifacts.map((a) => ({
      id: a.format,
      title: a.format.toUpperCase() + (a.pageCount ? ` · ${a.pageCount} pages` : ''),
      state: (a.url ? 'done' : 'active') as ItemProgress['state'],
    })),
  };
}
