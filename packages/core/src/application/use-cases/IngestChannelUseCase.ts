import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { Channel } from '../../domain/channel/Channel.js';
import { Video } from '../../domain/video/Video.js';
import { VideoId } from '../../domain/video/VideoId.js';
import { selectTopVideos } from '../../domain/video/VideoSelection.js';
import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { VideoRepository } from '../ports/repositories/VideoRepository.js';
import type { ChannelRepository } from '../ports/repositories/ChannelRepository.js';
import type { YouTubeMetadataProvider } from '../ports/services/YouTubeMetadataProvider.js';
import type { JobQueue } from '../ports/services/JobQueue.js';
import type { IdGenerator } from '../ports/IdGenerator.js';
import type { Clock } from '../ports/Clock.js';
import type { ProjectJob } from '../dto/jobs.dto.js';

/** Resolves the channel, ranks its uploads, persists the top `maxVideos` stubs, fans out video-data jobs. */
export class IngestChannelUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly videos: VideoRepository,
    private readonly channels: ChannelRepository,
    private readonly youtube: YouTubeMetadataProvider,
    private readonly queue: JobQueue,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(cmd: ProjectJob): Promise<Result<{ videoCount: number }>> {
    const projectId = ProjectId.from(cmd.projectId);
    const project = await this.projects.findById(projectId);
    if (!project) return Result.fail('Project not found');

    // Idempotency: if videos already persisted for this project, skip the API work.
    const existing = await this.videos.findByProject(projectId);
    if (existing.length > 0) return Result.ok({ videoCount: existing.length });

    const channelMeta = await this.youtube.resolveChannel(project.channelUrl.ref);
    if (channelMeta.isFail()) return Result.fail(channelMeta.error);
    await this.channels.saveChannel(projectId, Channel.create(channelMeta.value));

    // Fetch a broad candidate pool (up to 100) with full stats, then apply the
    // Phase 2 weighted score and keep the top `maxVideos`. A wide pool means the
    // selection is the channel's genuinely best videos, and there are always
    // enough candidates to satisfy maxVideos.
    const list = await this.youtube.listVideos(channelMeta.value.youtubeId, 100);
    if (list.isFail()) return Result.fail(list.error);
    const selected = selectTopVideos(
      list.value.map((m) => ({ ...m })),
      project.options.maxVideos,
    );

    const videos = selected.map((meta, index) =>
      Video.create({
        id: VideoId.from(this.ids.uuid()),
        projectId: projectId.value,
        youtubeId: meta.youtubeId,
        title: meta.title,
        description: meta.description,
        publishedAt: meta.publishedAt,
        durationSeconds: meta.durationSeconds,
        viewCount: meta.viewCount,
        position: index,
        hasAudio: true,
      }),
    );
    await this.videos.saveMany(videos);

    // Single convergence barrier for the whole per-video chain:
    // data → transcript → [whisper] → summarize → analyze-comments.
    // The last step (comment analysis) reports here; on zero the orchestrator
    // walks the project forward to BUILDING_KNOWLEDGE_BASE.
    project.setPending('VIDEO_PIPELINE', videos.length);
    project.advanceTo('FETCHING_VIDEO_DATA', this.clock.now());
    await this.projects.save(project);

    for (const v of videos) {
      await this.queue.enqueue(
        'video-data',
        { projectId: projectId.value, videoId: v.id.value },
        { jobId: `video-data:${projectId.value}:${v.id.value}` },
      );
    }
    return Result.ok({ videoCount: videos.length });
  }
}
