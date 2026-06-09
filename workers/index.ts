import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { QueueEvents, type Worker } from 'bullmq';
import { buildContainer, loadEnv } from '@yeg/config';
import { getRedisConnection, QUEUE_NAMES } from '@yeg/infrastructure';
import { buildWorkers } from './processors/index.js';

/**
 * Load the repo-root `.env` into process.env when running outside Docker (under
 * Docker, compose's `env_file` already populates the environment). Real env vars
 * win over the file, so this is a no-op when the vars are already set.
 */
function loadDotEnv(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let text: string;
  try {
    text = readFileSync(resolve(root, '.env'), 'utf8');
  } catch {
    return; // No .env file — rely on the ambient environment instead.
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key] !== undefined) continue; // Real env wins over the file.
    process.env[key] = (m[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

/**
 * Worker process entrypoint. Boots every stage worker, wires QueueEvents for
 * progress (consumed by the SSE endpoint), and shuts down gracefully on SIGTERM
 * so in-flight jobs finish and stalled jobs are recovered by BullMQ.
 */
async function main(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();
  const container = buildContainer(env);
  const connection = getRedisConnection(env.REDIS_URL);
  const log = container.logger.child({ component: 'workers' });

  const workers = buildWorkers(connection, container);

  // Progress bridge: publish stage events to a Redis pub/sub channel per project
  // (the SSE route subscribes). Kept lightweight — failures never block jobs.
  const queueEvents = QUEUE_NAMES.map((name) => new QueueEvents(name, { connection }));
  for (const events of queueEvents) {
    events.on('completed', ({ jobId }) => log.debug('job completed', { queue: events.name, jobId }));
    events.on('failed', ({ jobId, failedReason }) => log.warn('job failed', { queue: events.name, jobId, failedReason }));
  }

  log.info(`workers online: ${workers.length} queues`);

  const shutdown = async (signal: string): Promise<void> => {
    log.info(`received ${signal}, draining workers...`);
    await Promise.all(workers.map((w: Worker) => w.close()));
    await Promise.all(queueEvents.map((e) => e.close()));
    await connection.quit();
    log.info('shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Worker boot failed:', err);
  process.exit(1);
});
