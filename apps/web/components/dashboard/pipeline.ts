/**
 * Maps the backend project status into the premium, audience-framed analysis
 * narrative the dashboard shows ("Audience comments analyzed", "Book
 * opportunities discovered"). This is REAL data — it's derived from the live
 * project status returned by /api/projects — just relabelled for the product
 * story. The raw backend statuses live in the pipeline orchestrator.
 */

// Backend statuses in pipeline order (terminal states handled separately).
const ORDER = [
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
] as const;

export interface PremiumStage {
  label: string;
  /** The last backend status this premium stage covers. */
  through: (typeof ORDER)[number];
}

export const PREMIUM_STAGES: PremiumStage[] = [
  { label: 'Videos indexed', through: 'TRANSCRIBING_FALLBACK' },
  { label: 'Audience comments analyzed', through: 'ANALYZING_COMMENTS' },
  { label: 'Audience intelligence mapped', through: 'BUILDING_KNOWLEDGE_BASE' },
  { label: 'Book opportunities discovered', through: 'GENERATING_BOOK_STRATEGY' },
  { label: 'Outline structured', through: 'GENERATING_CHAPTER_RESEARCH' },
  { label: 'Chapters written', through: 'GENERATING_CHAPTERS' },
  { label: 'Manuscript polished', through: 'ASSEMBLING' },
  { label: 'Export ready', through: 'COMPLETED' },
];

export type StageState = 'done' | 'active' | 'pending';

export interface ResolvedStage {
  label: string;
  state: StageState;
}

export function isTerminal(status: string): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'PARTIAL';
}

export function isActiveStatus(status: string): boolean {
  return status !== 'COMPLETED' && status !== 'FAILED';
}

/** Resolve the premium stage checklist + overall percent for a project status. */
export function resolvePipeline(status: string): { stages: ResolvedStage[]; percent: number } {
  const completed = status === 'COMPLETED';
  const failed = status === 'FAILED' || status === 'PARTIAL';
  const idx = ORDER.indexOf(status as (typeof ORDER)[number]);
  const cur = idx === -1 ? (completed ? ORDER.length - 1 : 0) : idx;

  let activeAssigned = false;
  const stages = PREMIUM_STAGES.map((s) => {
    const end = ORDER.indexOf(s.through);
    let state: StageState;
    if (completed || cur > end) state = 'done';
    else if (!failed && !activeAssigned) {
      state = 'active';
      activeAssigned = true;
    } else state = 'pending';
    return { label: s.label, state };
  });

  const done = stages.filter((s) => s.state === 'done').length;
  const percent = completed ? 100 : Math.round((done / PREMIUM_STAGES.length) * 100);
  return { stages, percent };
}
