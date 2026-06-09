import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { NonRetryableError, type QueueName } from '@yeg/core';
import type { Container } from '@yeg/config';

export interface WorkerContext {
  container: Container;
  job: Job;
}

interface MakeWorkerOptions<S extends z.ZodTypeAny> {
  name: QueueName;
  concurrency: number;
  attempts: number;
  limiter?: { max: number; duration: number };
  payloadSchema: S;
  // Infer the schema's OUTPUT type so defaulted fields (e.g. `mode`) are required here.
  handler: (payload: z.infer<S>, ctx: WorkerContext) => Promise<unknown>;
}

/**
 * Uniform worker wrapper enforcing the retry-safety contract for EVERY queue:
 *   1. validate payload (poison-message guard)
 *   2. idempotency.begin → short-circuit if already completed
 *   3. run handler (no side effects before the guard)
 *   4. complete / fail the job_runs ledger; rethrow to let BullMQ retry
 */
export function makeWorker<S extends z.ZodTypeAny>(
  connection: Redis,
  container: Container,
  opts: MakeWorkerOptions<S>,
): Worker {
  const log = container.logger.child({ queue: opts.name });

  return new Worker(
    opts.name,
    async (job: Job) => {
      const parsed = opts.payloadSchema.safeParse(job.data);
      if (!parsed.success) {
        // Invalid payload can never succeed → do not retry.
        throw new NonRetryableError(`Invalid payload: ${parsed.error.message}`);
      }
      const payload = parsed.data;
      const jobKey = job.opts.jobId ?? `${opts.name}:${job.id}`;
      const inputHash = (payload as { inputHash?: string }).inputHash ?? jobKey;
      const projectId = (payload as { projectId?: string }).projectId ?? 'unknown';

      const guard = await container.idempotency.begin({
        jobKey,
        queue: opts.name,
        projectId,
        inputHash,
        attempt: job.attemptsMade,
      });
      if (guard.alreadyCompleted) {
        log.info(`⏭  ${opts.name} skipped (already completed)`, { jobKey, projectId });
        return guard.result;
      }

      const startedAt = Date.now();
      log.info(`▶  ${opts.name} started`, { jobKey, projectId, attempt: job.attemptsMade + 1 });
      try {
        const result = await opts.handler(payload, { container, job });
        await container.idempotency.complete(jobKey, result);
        const durationMs = Date.now() - startedAt;
        container.telemetry.recordStage({ queue: opts.name, projectId, durationMs, outcome: 'completed' });
        log.info(`✓  ${opts.name} completed`, { jobKey, projectId, durationMs });
        return result;
      } catch (err) {
        const terminal = err instanceof NonRetryableError || job.attemptsMade + 1 >= opts.attempts;
        if (terminal) {
          await container.idempotency.fail(jobKey, String(err));
          await failProject(container, projectId, opts.name, err);
          container.telemetry.recordStage({ queue: opts.name, projectId, durationMs: Date.now() - startedAt, outcome: 'failed' });
          log.error('job failed (terminal)', { jobKey, error: String(err) });
        } else {
          log.warn('job failed (will retry)', { jobKey, attempt: job.attemptsMade, error: String(err) });
        }
        throw err; // BullMQ applies backoff / moves to failed
      }
    },
    {
      connection,
      concurrency: opts.concurrency,
      ...(opts.limiter ? { limiter: opts.limiter } : {}),
      // exponential backoff with jitter
      settings: { backoffStrategy: (attempts: number) => Math.min(5000 * 2 ** attempts, 300_000) + Math.floor(attempts * 137) },
    },
  );
}

async function failProject(container: Container, projectId: string, queue: string, err: unknown): Promise<void> {
  if (projectId === 'unknown') return;
  try {
    const project = await container.repositories.projects.findById(
      // lazy import avoids a cycle; ProjectId is re-exported from core
      (await import('@yeg/core')).ProjectId.from(projectId),
    );
    if (!project) return;
    project.markFailed(`Stage ${queue} failed: ${String(err)}`, container.clock.now());
    await container.repositories.projects.save(project);
  } catch {
    /* best-effort */
  }
}
