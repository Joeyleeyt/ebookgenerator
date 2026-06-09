import { YoutubeTranscript } from 'youtube-transcript';
import { Result, type TranscriptProvider, type RawTranscript } from '@yeg/core';

/**
 * Tries YouTube captions first. Returns Result.ok(null) when none exist so the
 * use case can fall back to Whisper. Transport errors → Result.fail (retryable).
 */
export class YouTubeTranscriptProvider implements TranscriptProvider {
  async fetch(videoId: string): Promise<Result<RawTranscript | null>> {
    try {
      const items = await YoutubeTranscript.fetchTranscript(videoId);
      if (!items || items.length === 0) return Result.ok(null);
      const segments = items.map((i) => ({ start: i.offset / 1000, duration: i.duration / 1000, text: i.text }));
      return Result.ok({
        language: items[0]?.lang ?? null,
        text: segments.map((s) => s.text).join(' '),
        segments,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // "Transcript is disabled" / "No transcript" → no captions, trigger fallback.
      if (/disabled|not available|no transcript/i.test(msg)) return Result.ok(null);
      return Result.fail(msg); // transient (network/rate) → retry
    }
  }
}
