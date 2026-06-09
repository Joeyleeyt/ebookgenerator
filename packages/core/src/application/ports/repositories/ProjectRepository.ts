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
  /** List a user's projects, newest first (read model for the dashboard). */
  listByOwner(ownerId: string): Promise<ProjectListItem[]>;
}
