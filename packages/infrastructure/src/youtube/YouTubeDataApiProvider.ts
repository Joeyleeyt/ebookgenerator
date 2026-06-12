import { google, type youtube_v3 } from 'googleapis';
import {
  Result,
  type YouTubeMetadataProvider,
  type ChannelMetadata,
  type VideoMetadata,
  type RawComment,
  type ChannelRef,
} from '@yeg/core';

/** YouTube Data API v3 adapter for channel/video metadata and comments. */
export class YouTubeDataApiProvider implements YouTubeMetadataProvider {
  private readonly yt: youtube_v3.Youtube;

  constructor(apiKey: string) {
    this.yt = google.youtube({ version: 'v3', auth: apiKey });
  }

  async resolveChannel(ref: ChannelRef): Promise<Result<ChannelMetadata>> {
    try {
      const params: youtube_v3.Params$Resource$Channels$List = {
        part: ['snippet', 'statistics'],
      };
      if (ref.kind === 'id') params.id = [ref.value];
      else if (ref.kind === 'handle') params.forHandle = ref.value;
      else params.forUsername = ref.value;

      const { data } = await this.yt.channels.list(params);
      const ch = data.items?.[0];
      if (!ch?.id) return Result.fail('Channel not found');
      return Result.ok({
        youtubeId: ch.id,
        title: ch.snippet?.title ?? '',
        description: ch.snippet?.description ?? null,
        subscriberCount: numOrNull(ch.statistics?.subscriberCount),
        videoCount: numOrNull(ch.statistics?.videoCount),
        thumbnailUrl: ch.snippet?.thumbnails?.high?.url ?? null,
      });
    } catch (e) {
      return Result.fail(asMessage(e));
    }
  }

  async listVideos(channelId: string, candidateLimit: number): Promise<Result<VideoMetadata[]>> {
    try {
      // search.list is NOT exhaustive — it's relevance-capped and routinely returns
      // far fewer than a channel's real video count (so a 30-video request could only
      // ingest ~15). Enumerate the channel's UPLOADS playlist instead: the complete,
      // paginated video list. selectTopVideos then ranks these by engagement.
      const ch = await this.yt.channels.list({ part: ['contentDetails'], id: [channelId] });
      const uploads = ch.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploads) return Result.ok([]);

      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const page = await this.yt.playlistItems.list({
          part: ['contentDetails'],
          playlistId: uploads,
          maxResults: 50,
          ...(pageToken ? { pageToken } : {}),
        });
        for (const item of page.data.items ?? []) {
          const vid = item.contentDetails?.videoId;
          if (vid) ids.push(vid);
        }
        pageToken = page.data.nextPageToken ?? undefined;
      } while (pageToken && ids.length < candidateLimit);
      if (ids.length === 0) return Result.ok([]);

      // Hydrate snippet/stats in batches of 50 (the videos.list id cap).
      const videos: VideoMetadata[] = [];
      for (let i = 0; i < ids.length; i += 50) {
        const details = await this.yt.videos.list({ part: ['snippet', 'statistics', 'contentDetails'], id: ids.slice(i, i + 50) });
        videos.push(...(details.data.items ?? []).map(mapVideo));
      }
      return Result.ok(videos);
    } catch (e) {
      return Result.fail(asMessage(e));
    }
  }

  async getVideo(videoId: string): Promise<Result<VideoMetadata>> {
    try {
      const { data } = await this.yt.videos.list({ part: ['snippet', 'statistics', 'contentDetails'], id: [videoId] });
      const v = data.items?.[0];
      if (!v) return Result.fail('Video not found');
      return Result.ok(mapVideo(v));
    } catch (e) {
      return Result.fail(asMessage(e));
    }
  }

  async listTopComments(videoId: string, limit: number): Promise<Result<RawComment[]>> {
    try {
      const { data } = await this.yt.commentThreads.list({
        part: ['snippet'],
        videoId,
        order: 'relevance',
        maxResults: Math.min(limit, 100),
      });
      const comments = (data.items ?? []).map((t) => {
        const c = t.snippet?.topLevelComment?.snippet;
        return {
          youtubeId: t.id ?? '',
          author: c?.authorDisplayName ?? null,
          text: c?.textOriginal ?? '',
          likeCount: c?.likeCount ?? 0,
          publishedAt: c?.publishedAt ? new Date(c.publishedAt) : null,
        } satisfies RawComment;
      });
      return Result.ok(comments);
    } catch (e) {
      // Comments are often disabled — treat as empty, not an error.
      return Result.ok([]);
    }
  }
}

function mapVideo(v: youtube_v3.Schema$Video): VideoMetadata {
  return {
    youtubeId: v.id ?? '',
    title: v.snippet?.title ?? '',
    description: v.snippet?.description ?? null,
    publishedAt: v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : null,
    durationSeconds: parseIsoDuration(v.contentDetails?.duration ?? null),
    viewCount: numOrNull(v.statistics?.viewCount),
    likeCount: numOrNull(v.statistics?.likeCount),
    commentCount: numOrNull(v.statistics?.commentCount),
  };
}

function numOrNull(v: string | null | undefined): number | null {
  return v == null ? null : Number(v);
}

function parseIsoDuration(iso: string | null): number | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function asMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
