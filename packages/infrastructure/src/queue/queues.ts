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
  'whisper-transcribe': { concurrency: 2, attempts: 3 },
  'video-summarize': { concurrency: 6, attempts: 4, limiter: { max: 50, duration: 60_000 } },
  'analyze-comments': { concurrency: 8, attempts: 4, limiter: { max: 100, duration: 60_000 } },
  'knowledge-base': { concurrency: 4, attempts: 4 },
  'book-strategy': { concurrency: 4, attempts: 4 },
  'outline-generate': { concurrency: 4, attempts: 4 },
  'chapter-research': { concurrency: 8, attempts: 4, limiter: { max: 60, duration: 60_000 } },
  'chapter-generate': { concurrency: 8, attempts: 3, limiter: { max: 50, duration: 60_000 } },
  // Controller only — fans out one polish-chapter job per chapter; no LLM call here.
  'polish-book': { concurrency: 4, attempts: 3 },
  // The actual per-chapter polishing LLM work — parallelized, was a serial loop.
  'polish-chapter': { concurrency: 8, attempts: 3, limiter: { max: 50, duration: 60_000 } },
  'extra-content': { concurrency: 3, attempts: 3, limiter: { max: 30, duration: 60_000 } },
  'ebook-assemble': { concurrency: 4, attempts: 3 },
  export: { concurrency: 3, attempts: 3 },
};
