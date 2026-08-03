export type QueueName =
  | 'channel-ingest'
  | 'video-data'
  | 'transcript-fetch'
  | 'whisper-transcribe'
  | 'video-summarize'
  | 'analyze-comments'
  | 'knowledge-base'
  | 'book-strategy'
  | 'outline-generate'
  | 'chapter-research'
  | 'chapter-generate'
  | 'polish-book'
  | 'polish-chapter'
  | 'extra-content'
  | 'ebook-assemble'
  | 'export'
  | 'landing-page';

export interface EnqueueOptions {
  /** Deterministic id → BullMQ de-duplicates identical jobs. */
  jobId: string;
  attempts?: number;
  delayMs?: number;
}

/** Abstraction over BullMQ so use cases stay infrastructure-free. */
export interface JobQueue {
  enqueue<T extends Record<string, unknown>>(
    queue: QueueName,
    payload: T,
    options: EnqueueOptions,
  ): Promise<void>;

  /** Queues that currently hold failed jobs for a project (for retry diagnosis). */
  failedStages(projectId: string): Promise<QueueName[]>;

  /** Re-run every failed job belonging to a project; returns how many were retried. */
  retryFailed(projectId: string): Promise<number>;

  /** Remove a project's not-yet-running jobs (waiting/delayed). Returns how many were removed. */
  drain(projectId: string): Promise<number>;
}
