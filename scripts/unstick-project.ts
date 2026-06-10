/**
 * Maintenance: force-advance a project that's wedged on a convergence barrier.
 *
 * Use when the per-video (or per-chapter) work is verifiably complete in the DB
 * but the project status never advanced because a barrier decrement was lost
 * (e.g. a worker restart between the use-case write and decrementPending).
 *
 * Usage:
 *   pnpm exec tsx scripts/unstick-project.ts <projectId> [TARGET_STAGE]
 * Default TARGET_STAGE is BUILDING_KNOWLEDGE_BASE (the stage after the per-video
 * convergence). reachStage walks the status forward and enqueues the stage's
 * entry job, so the workers pick the pipeline back up from there.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildContainer } from '@yeg/config';
import { ProjectId, type ProjectState } from '@yeg/core';

/** Load the repo-root `.env` into process.env (mirrors workers/index.ts). */
function loadDotEnv(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let text: string;
  try {
    text = readFileSync(resolve(root, '.env'), 'utf8');
  } catch {
    return; // rely on the ambient environment instead
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1]!;
    if (process.env[key] !== undefined) continue; // real env wins over the file
    process.env[key] = (m[2] ?? '').replace(/^["']|["']$/g, '');
  }
}

async function main(): Promise<void> {
  loadDotEnv();

  const projectId = process.argv[2];
  const target = (process.argv[3] ?? 'BUILDING_KNOWLEDGE_BASE') as ProjectState;
  if (!projectId) {
    console.error('Usage: tsx scripts/unstick-project.ts <projectId> [TARGET_STAGE]');
    process.exit(1);
  }

  const c = buildContainer();
  const before = await c.repositories.projects.findById(ProjectId.from(projectId));
  if (!before) {
    console.error(`Project ${projectId} not found`);
    process.exit(1);
  }
  console.log(`Project ${projectId}: status=${before.status.value} pending=${JSON.stringify(before.pendingCounts)}`);

  // reachStage takes the raw string id; it walks the status forward to `target`
  // and enqueues that stage's entry job so the workers resume the pipeline.
  await c.orchestrator.reachStage(projectId, target);

  const after = await c.repositories.projects.findById(ProjectId.from(projectId));
  console.log(`→ advanced to ${after?.status.value}; enqueued the entry job for ${target}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error('unstick failed:', err);
  process.exit(1);
});
