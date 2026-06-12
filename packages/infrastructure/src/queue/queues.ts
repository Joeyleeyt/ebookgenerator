import type { QueueName } from '@yeg/core';

export const QUEUE_NAMES: QueueName[] = [
  'channel-ingest',
  'video-data',
  'transcript-fetch',
  'whisper-transcribe',
  'video-summarize',
  'analyze-comments',
  'knowledge-base',
  'book-strategy',
  'outline-generate',
  'chapter-research',
  'chapter-generate',
  'polish-book',
  'polish-chapter',
  'extra-content',
  'ebook-assemble',
  'export',
];

/** Per-queue worker settings — concurrency, rate limits, retry attempts. */
export interface QueueConfig {
  concurrency: number;
  attempts: number;
  limiter?: { max: number; duration: number };
}

export const QUEUE_CONFIG: Record<QueueName, QueueConfig> = {
  'channel-ingest': { concurrency: 5, attempts: 5 },
  'video-data': { concurrency: 10, attempts: 5 },
  // Parallel again: the proxy pool rotates a distinct starting IP per video, so
  // concurrent downloads spread across proxies instead of hammering one. Keep
  // concurrency <= the number of working proxies so each lands on its own IP.
  'transcript-fetch': { concurrency: 6, attempts: 4 },
  // Audio download + Whisper transcription, the slowest per-video stage. Bounded
  // by the Whisper API and worker CPU/network (not the Anthropic tier), so raised
  // modestly rather than to the chapter-queue levels.
  'whisper-transcribe': { concurrency: 4, attempts: 3 },
  'video-summarize': { concurrency: 6, attempts: 4, limiter: { max: 50, duration: 60_000 } },
  'analyze-comments': { concurrency: 8, attempts: 4, limiter: { max: 100, duration: 60_000 } },
  'knowledge-base': { concurrency: 4, attempts: 4 },
  'book-strategy': { concurrency: 4, attempts: 4 },
  'outline-generate': { concurrency: 4, attempts: 4 },
  // Per-chapter research (Sonnet) — raised alongside the chapter queues so a
  // whole book's research fans out at once on Tier 3+.
  'chapter-research': { concurrency: 16, attempts: 4, limiter: { max: 100, duration: 60_000 } },
  // Drafting runs on Sonnet (fast, high tier limits). Tier 3+: let all chapters
  // of a typical book draft at once so the stage collapses to ~one chapter's latency.
  'chapter-generate': { concurrency: 16, attempts: 3, limiter: { max: 100, duration: 60_000 } },
  // Controller only — fans out one polish-chapter job per chapter; no LLM call here.
  'polish-book': { concurrency: 4, attempts: 3 },
  // The actual per-chapter polishing LLM work (Opus) — parallelized, was a serial
  // loop. Limiter a touch lower than drafting since Opus tier limits are tighter.
  'polish-chapter': { concurrency: 16, attempts: 3, limiter: { max: 80, duration: 60_000 } },
  'extra-content': { concurrency: 3, attempts: 3, limiter: { max: 30, duration: 60_000 } },
  'ebook-assemble': { concurrency: 4, attempts: 3 },
  export: { concurrency: 3, attempts: 3 },
};
