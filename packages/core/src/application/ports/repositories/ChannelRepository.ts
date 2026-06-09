import type { Channel } from '../../../domain/channel/Channel.js';
import type { ChannelSummary } from '../../../domain/channel/ChannelSummary.js';
import type { VideoSummary } from '../../../domain/video/VideoSummary.js';
import type { ProjectId } from '../../../domain/project/ProjectId.js';

export interface ChannelRepository {
  saveChannel(projectId: ProjectId, channel: Channel): Promise<void>;
  getChannel(projectId: ProjectId): Promise<Channel | null>;
  saveSummary(projectId: ProjectId, summary: ChannelSummary): Promise<void>;
  getSummary(projectId: ProjectId): Promise<ChannelSummary | null>;
  /** All per-video summaries for the reduce step. */
  listVideoSummaries(projectId: ProjectId): Promise<VideoSummary[]>;
}
