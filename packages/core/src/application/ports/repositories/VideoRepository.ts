import type { Video } from '../../../domain/video/Video.js';
import type { VideoId } from '../../../domain/video/VideoId.js';
import type { ProjectId } from '../../../domain/project/ProjectId.js';

export interface VideoRepository {
  findById(id: VideoId): Promise<Video | null>;
  findByProject(projectId: ProjectId): Promise<Video[]>;
  /** Upsert keyed on (project_id, youtube_id) — safe to re-run. */
  save(video: Video): Promise<void>;
  saveMany(videos: Video[]): Promise<void>;
}
