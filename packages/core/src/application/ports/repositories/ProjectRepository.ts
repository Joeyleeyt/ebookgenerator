import type { Project } from '../../../domain/project/Project.js';
import type { ProjectId } from '../../../domain/project/ProjectId.js';
import type { ProjectState } from '../../../domain/project/ProjectStatus.js';

/** Lightweight read-model row for listing a user's projects (no aggregate load). */
export interface ProjectListItem {
  id: string;
  channelUrl: string;
  status: ProjectState;
  createdAt: string;
}

export interface ProjectRepository {
  findById(id: ProjectId): Promise<Project | null>;
  save(project: Project): Promise<void>;
  /** Atomic per-stage fan-in counter decrement; returns remaining count. */
  decrementPending(id: ProjectId, stage: string): Promise<number>;
  /**
   * Atomically transition status from any of `from` to `to` in a single guarded
   * write. Returns true iff THIS call performed the transition. Concurrency-safe:
   * when many fan-in jobs converge at once, exactly one wins and the rest no-op,
   * so the status can't be clobbered by racing read-modify-write saves.
   */
  advanceStatusAtomic(id: ProjectId, from: ProjectState[], to: ProjectState): Promise<boolean>;
  /** List a user's projects, newest first (read model for the dashboard). */
  listByOwner(ownerId: string): Promise<ProjectListItem[]>;
  /**
   * How many of a user's projects are actually consuming worker capacity —
   * non-terminal and not QUEUED. Backs the per-user concurrency cap.
   */
  countRunningByOwner(ownerId: string): Promise<number>;
  /** A user's QUEUED projects, oldest first — the order they'll be started in. */
  listQueuedByOwner(ownerId: string): Promise<ProjectListItem[]>;
}
