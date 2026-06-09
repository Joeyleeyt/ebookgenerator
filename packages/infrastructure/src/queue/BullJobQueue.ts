import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { JobQueue, QueueName, EnqueueOptions } from '@yeg/core';
import { QUEUE_NAMES, QUEUE_CONFIG } from './queues.js';

/**
 * BullMQ reserves `:` for its own Redis key namespacing and rejects any custom
 * job ID containing it ("Custom Id cannot contain :"). Our use cases build
 * deterministic, colon-delimited IDs for dedup; collapse `:` to `-` at this
 * single boundary so the IDs stay deterministic (same input → same ID, so dedup
 * is preserved) while satisfying BullMQ. Callers keep their readable `:`
 * convention, and the worker reads back this same value via `job.opts.jobId`,
 * keeping the idempotency ledger consistent.
 */
function toBullJobId(jobId: string): string {
  return jobId.replace(/:/g, '-');
}

/** BullMQ-backed implementation of the JobQueue port used by use cases. */
export class BullJobQueue implements JobQueue {
  private readonly queues = new Map<QueueName, Queue>();

  constructor(connection: Redis) {
    for (const name of QUEUE_NAMES) {
      this.queues.set(name, new Queue(name, { connection }));
    }
  }

  async enqueue<T extends Record<string, unknown>>(
    queue: QueueName,
    payload: T,
    options: EnqueueOptions,
  ): Promise<void> {
    const q = this.queues.get(queue);
    if (!q) throw new Error(`Unknown queue: ${queue}`);
    await q.add(queue, payload, {
      jobId: toBullJobId(options.jobId), // deterministic → dedup (`:` → `-` for BullMQ)
      attempts: options.attempts ?? QUEUE_CONFIG[queue].attempts,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 86_400 },
      removeOnFail: false, // keep for dead-letter inspection / retry endpoint
      ...(options.delayMs ? { delay: options.delayMs } : {}),
    });
  }

  async failedStages(projectId: string): Promise<QueueName[]> {
    const stages: QueueName[] = [];
    for (const [name, q] of this.queues) {
      const failed = await q.getFailed(0, 1000);
      if (failed.some((job) => job.data?.projectId === projectId)) stages.push(name);
    }
    return stages;
  }

  async retryFailed(projectId: string): Promise<number> {
    let retried = 0;
    for (const q of this.queues.values()) {
      const failed = await q.getFailed(0, 1000);
      for (const job of failed) {
        if (job.data?.projectId !== projectId) continue;
        await job.retry(); // moves the job back to waiting with its original payload
        retried += 1;
      }
    }
    return retried;
  }

  async drain(projectId: string): Promise<number> {
    let removed = 0;
    for (const q of this.queues.values()) {
      // Only not-yet-running states; active jobs are left to finish (then become no-ops).
      const pending = await q.getJobs(['waiting', 'delayed', 'paused', 'prioritized'], 0, 1000);
      for (const job of pending) {
        if (job.data?.projectId !== projectId) continue;
        await job.remove();
        removed += 1;
      }
    }
    return removed;
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
