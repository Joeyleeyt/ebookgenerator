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
  'transcript-fetch': { concurrency: 8, attempts: 4 },
  'whisper-transcribe': { concurrency: 2, attempts: 3 },
  'video-summarize': { concurrency: 6, attempts: 4, limiter: { max: 50, duration: 60_000 } },
  'analyze-comments': { concurrency: 8, attempts: 4, limiter: { max: 100, duration: 60_000 } },
  'knowledge-base': { concurrency: 4, attempts: 4 },
  'book-strategy': { concurrency: 4, attempts: 4 },
  'outline-generate': { concurrency: 4, attempts: 4 },
  'chapter-research': { concurrency: 5, attempts: 4, limiter: { max: 40, duration: 60_000 } },
  'chapter-generate': { concurrency: 4, attempts: 3, limiter: { max: 30, duration: 60_000 } },
  'polish-book': { concurrency: 2, attempts: 3, limiter: { max: 30, duration: 60_000 } },
  'extra-content': { concurrency: 3, attempts: 3, limiter: { max: 30, duration: 60_000 } },
  'ebook-assemble': { concurrency: 4, attempts: 3 },
  export: { concurrency: 3, attempts: 3 },
};
