/**
 * Maps the backend project status into the premium, audience-framed analysis
 * narrative the dashboard and pipeline view show. Each premium stage carries
 * sub-steps — the concrete work happening inside it — so the in-progress stage
 * can expand to reveal exactly what the AI is doing right now, including live
 * fan-in counters (videos / chapters) read from the project's pendingCounts.
 */

// Backend statuses in pipeline order (terminal states handled separately).
const ORDER: readonly string[] = [
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

export interface SubStepDef {
  status: string;
  label: string;
  /** pendingCounts barrier key that reports live "remaining" for this sub-step. */
  barrier?: string;
  unit?: string;
  /** Per-item collection to list under this sub-step ('videos' | 'chapters'). */
  itemsKey?: string;
}

interface StageDef {
  label: string;
  substeps: SubStepDef[];
}

export const PREMIUM_STAGES: StageDef[] = [
  {
    label: 'Videos indexed',
    substeps: [
      { status: 'INGESTING_CHANNEL', label: 'Reading the channel & listing videos', itemsKey: 'videos.discovered' },
      {
        status: 'FETCHING_VIDEO_DATA',
        label: 'Fetching video data',
        barrier: 'VIDEO_PIPELINE',
        unit: 'videos',
        itemsKey: 'videos.data',
      },
      { status: 'FETCHING_TRANSCRIPTS', label: 'Collecting transcripts', itemsKey: 'videos.transcripts' },
      { status: 'TRANSCRIBING_FALLBACK', label: 'Transcribing audio where missing', itemsKey: 'videos.whisper' },
    ],
  },
  {
    label: 'Audience comments analyzed',
    substeps: [
      { status: 'SUMMARIZING_VIDEOS', label: 'Summarizing each video', itemsKey: 'videos.summaries' },
      {
        status: 'ANALYZING_COMMENTS',
        label: 'Reading & clustering audience comments',
        itemsKey: 'videos.comments',
      },
    ],
  },
  {
    label: 'Audience intelligence mapped',
    substeps: [{ status: 'BUILDING_KNOWLEDGE_BASE', label: 'Building the channel knowledge base' }],
  },
  {
    label: 'Book opportunities discovered',
    substeps: [{ status: 'GENERATING_BOOK_STRATEGY', label: 'Scoring opportunities & picking the angle' }],
  },
  {
    label: 'Outline structured',
    substeps: [
      { status: 'GENERATING_OUTLINE', label: 'Drafting the table of contents', itemsKey: 'outline' },
      {
        status: 'GENERATING_CHAPTER_RESEARCH',
        label: 'Researching each chapter',
        barrier: 'GENERATING_CHAPTER_RESEARCH',
        unit: 'chapters',
        itemsKey: 'chapters.research',
      },
    ],
  },
  {
    label: 'Chapters written',
    substeps: [
      {
        status: 'GENERATING_CHAPTERS',
        label: 'Writing chapters',
        barrier: 'GENERATING_CHAPTERS',
        unit: 'chapters',
        itemsKey: 'chapters.write',
      },
    ],
  },
  {
    label: 'Manuscript polished',
    substeps: [
      {
        status: 'POLISHING_BOOK',
        label: 'Polishing prose & consistency',
        barrier: 'POLISHING_BOOK',
        unit: 'chapters',
        itemsKey: 'chapters.polish',
      },
      { status: 'ASSEMBLING', label: 'Assembling the manuscript', itemsKey: 'chapters.assemble' },
    ],
  },
  {
    label: 'Export ready',
    substeps: [
      { status: 'EXPORTING', label: 'Rendering PDF & DOCX', itemsKey: 'exports' },
      { status: 'COMPLETED', label: 'Finalizing downloads', itemsKey: 'exports' },
    ],
  },
];

export type StageState = 'done' | 'active' | 'pending';

export interface ResolvedSubStep {
  label: string;
  state: StageState;
  barrier?: string | undefined;
  unit?: string | undefined;
  itemsKey?: string | undefined;
}

export interface ResolvedStage {
  label: string;
  state: StageState;
  substeps: ResolvedSubStep[];
}

export function isTerminal(status: string): boolean {
  return status === 'COMPLETED' || status === 'FAILED' || status === 'PARTIAL';
}

export function isActiveStatus(status: string): boolean {
  return status !== 'COMPLETED' && status !== 'FAILED';
}

/** Resolve the premium stage checklist (with sub-steps) + overall percent. */
export function resolvePipeline(status: string): { stages: ResolvedStage[]; percent: number } {
  const completed = status === 'COMPLETED';
  const failed = status === 'FAILED' || status === 'PARTIAL';
  const idx = ORDER.indexOf(status);
  const cur = idx === -1 ? (completed ? ORDER.length - 1 : 0) : idx;

  const stages: ResolvedStage[] = PREMIUM_STAGES.map((stage) => {
    const indices = stage.substeps.map((s) => ORDER.indexOf(s.status));
    const start = Math.min(...indices);
    const end = Math.max(...indices);

    let state: StageState;
    if (completed || cur > end) state = 'done';
    else if (!failed && cur >= start && cur <= end) state = 'active';
    else state = 'pending';

    const substeps: ResolvedSubStep[] = stage.substeps.map((s) => {
      const i = ORDER.indexOf(s.status);
      let st: StageState;
      if (completed || cur > i) st = 'done';
      else if (!failed && cur === i) st = 'active';
      else st = 'pending';
      return { label: s.label, state: st, barrier: s.barrier, unit: s.unit, itemsKey: s.itemsKey };
    });

    return { label: stage.label, state, substeps };
  });

  const done = stages.filter((s) => s.state === 'done').length;
  const percent = completed ? 100 : Math.round((done / PREMIUM_STAGES.length) * 100);
  return { stages, percent };
}
