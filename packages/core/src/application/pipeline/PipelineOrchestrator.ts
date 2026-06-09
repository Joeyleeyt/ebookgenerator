import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { JobQueue, QueueName } from '../ports/services/JobQueue.js';
import type { Clock } from '../ports/Clock.js';
import type { Logger } from '../ports/Logger.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import type { ProjectState } from '../../domain/project/ProjectStatus.js';

/**
 * The single component allowed to advance the project state machine and enqueue
 * the next pipeline stage. Fan-in barriers are implemented with the atomic
 * decrementPending counter — no distributed locks.
 */
export class PipelineOrchestrator {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly queue: JobQueue,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Called by a fan-out child when it finishes; advances when the barrier hits zero. */
  async onStageItemCompleted(projectId: string, stage: ProjectState): Promise<void> {
    const remaining = await this.projects.decrementPending(ProjectId.from(projectId), stage);
    this.logger.debug('stage item completed', { projectId, stage, remaining });
    if (remaining <= 0) await this.advance(projectId, stage);
  }

  /**
   * Walk the linear pipeline forward until `target`, applying each valid
   * transition, then enqueue the target stage's entry job. Used by the
   * per-video convergence barrier, which spans several coarse phases.
   */
  async reachStage(projectId: string, target: ProjectState): Promise<void> {
    const project = await this.projects.findById(ProjectId.from(projectId));
    if (!project) return;
    if (project.status.value === target) return;

    let guard = 0;
    while (project.status.value !== target && guard++ < 16) {
      const next = NEXT_STAGE[project.status.value];
      if (!next) break;
      const r = project.advanceTo(next, this.clock.now());
      if (r.isFail()) {
        this.logger.warn('reachStage stopped', { projectId, at: project.status.value, target, error: r.error });
        break;
      }
    }
    await this.projects.save(project);
    if (project.status.value === target) await this.enqueueStageEntry(projectId, target);
  }

  /**
   * Retry a FAILED project. Re-queues every failed BullMQ job for the project and
   * rewinds the project status to the earliest failed stage so the barrier/advance
   * logic can move forward again once the replayed jobs succeed.
   */
  async resume(projectId: string): Promise<{ retried: number; stage?: ProjectState }> {
    const project = await this.projects.findById(ProjectId.from(projectId));
    if (!project) return { retried: 0 };
    if (project.status.value !== 'FAILED') return { retried: 0 };

    const failedQueues = await this.queue.failedStages(projectId);
    const stage = earliestStage(failedQueues);
    if (!stage) {
      this.logger.warn('resume: no failed jobs to retry', { projectId });
      return { retried: 0 };
    }

    // Rewind status BEFORE replaying so a fast-completing job can advance the barrier.
    const reset = project.resumeAt(stage, this.clock.now());
    if (reset.isFail()) {
      this.logger.warn('resume: could not rewind status', { projectId, stage, error: reset.error });
      return { retried: 0 };
    }
    await this.projects.save(project);

    const retried = await this.queue.retryFailed(projectId);
    this.logger.info('resume: retried failed jobs', { projectId, stage, retried });
    return { retried, stage };
  }

  /** Advance from a just-completed stage to the next, enqueuing its job(s). */
  async advance(projectId: string, completed: ProjectState): Promise<void> {
    const next = NEXT_STAGE[completed];
    if (!next) return;
    const project = await this.projects.findById(ProjectId.from(projectId));
    if (!project) return;

    const transition = project.advanceTo(next, this.clock.now());
    if (transition.isFail()) {
      this.logger.warn('skipping illegal transition', { projectId, completed, next, error: transition.error });
      return;
    }
    await this.projects.save(project);
    await this.enqueueStageEntry(projectId, next);
  }

  /** Enqueue the entrypoint job for a stage (fan-out jobs are scheduled by the use case). */
  private async enqueueStageEntry(projectId: string, stage: ProjectState): Promise<void> {
    const queueName = STAGE_ENTRY_QUEUE[stage];
    if (!queueName) return; // fan-out stages enqueue their own children
    await this.queue.enqueue(queueName, { projectId }, { jobId: `${queueName}:${projectId}` });
  }
}

/** Linear stage progression (conditional branches & fan-outs resolved inside use cases). */
const NEXT_STAGE: Partial<Record<ProjectState, ProjectState>> = {
  INGESTING_CHANNEL: 'FETCHING_VIDEO_DATA',
  FETCHING_VIDEO_DATA: 'FETCHING_TRANSCRIPTS',
  FETCHING_TRANSCRIPTS: 'SUMMARIZING_VIDEOS',
  TRANSCRIBING_FALLBACK: 'SUMMARIZING_VIDEOS',
  SUMMARIZING_VIDEOS: 'ANALYZING_COMMENTS',
  ANALYZING_COMMENTS: 'BUILDING_KNOWLEDGE_BASE',
  BUILDING_KNOWLEDGE_BASE: 'GENERATING_BOOK_STRATEGY',
  GENERATING_BOOK_STRATEGY: 'GENERATING_OUTLINE',
  GENERATING_OUTLINE: 'GENERATING_CHAPTER_RESEARCH',
  GENERATING_CHAPTER_RESEARCH: 'GENERATING_CHAPTERS',
  GENERATING_CHAPTERS: 'POLISHING_BOOK',
  POLISHING_BOOK: 'ASSEMBLING',
  ASSEMBLING: 'EXPORTING',
  EXPORTING: 'COMPLETED',
};

/**
 * Stages with a single controller entry job. Fan-out stages
 * (GENERATING_CHAPTER_RESEARCH, GENERATING_CHAPTERS) are intentionally absent —
 * their producer use cases set the barrier and enqueue the per-item jobs.
 */
const STAGE_ENTRY_QUEUE: Partial<Record<ProjectState, QueueName>> = {
  BUILDING_KNOWLEDGE_BASE: 'knowledge-base',
  GENERATING_BOOK_STRATEGY: 'book-strategy',
  GENERATING_OUTLINE: 'outline-generate',
  POLISHING_BOOK: 'polish-book',
  ASSEMBLING: 'ebook-assemble',
  EXPORTING: 'export',
};

/** The stage each queue belongs to — used to rewind a FAILED project on retry. */
const QUEUE_TO_STAGE: Record<QueueName, ProjectState> = {
  'channel-ingest': 'INGESTING_CHANNEL',
  'video-data': 'FETCHING_VIDEO_DATA',
  'transcript-fetch': 'FETCHING_TRANSCRIPTS',
  'whisper-transcribe': 'TRANSCRIBING_FALLBACK',
  'video-summarize': 'SUMMARIZING_VIDEOS',
  'analyze-comments': 'ANALYZING_COMMENTS',
  'knowledge-base': 'BUILDING_KNOWLEDGE_BASE',
  'book-strategy': 'GENERATING_BOOK_STRATEGY',
  'outline-generate': 'GENERATING_OUTLINE',
  'chapter-research': 'GENERATING_CHAPTER_RESEARCH',
  'chapter-generate': 'GENERATING_CHAPTERS',
  'polish-book': 'POLISHING_BOOK',
  'extra-content': 'GENERATING_CHAPTERS', // user-triggered; rewind alongside chapters
  'ebook-assemble': 'ASSEMBLING',
  export: 'EXPORTING',
};

/** Linear order of pipeline stages, for picking the earliest among several failures. */
const STAGE_ORDER: ProjectState[] = [
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

/** Map failed queues to their stages and return the earliest one in pipeline order. */
function earliestStage(queues: QueueName[]): ProjectState | undefined {
  const stages = queues.map((q) => QUEUE_TO_STAGE[q]).filter((s): s is ProjectState => Boolean(s));
  if (stages.length === 0) return undefined;
  return stages.reduce((earliest, s) => (STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(earliest) ? s : earliest));
}
