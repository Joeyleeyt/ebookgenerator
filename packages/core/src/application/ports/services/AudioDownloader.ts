import type { Result } from '../../../domain/shared/Result.js';

/** Downloads a video's audio track to object storage; returns the storage ref. */
export interface AudioDownloader {
  downloadAudio(youtubeId: string): Promise<Result<{ audioRef: string }>>;
}
