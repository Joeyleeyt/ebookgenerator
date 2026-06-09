import { ProjectId } from '@yeg/core';
import { container } from '../../../../lib/server/container.js';
import { getUserId } from '../../../../lib/server/auth.js';
import { json, error } from '../../../../lib/server/http.js';

export const runtime = 'nodejs';

// GET /api/projects/:id — project status + progress.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const project = await container().repositories.projects.findById(ProjectId.from(params.id));
  if (!project) return error('Not found', 404);
  if (project.ownerId !== userId) return error('Forbidden', 403);

  return json({
    id: params.id,
    status: project.status.value,
    pending: project.pendingCounts,
    error: project.error ?? null,
    options: {
      targetPages: project.options.targetPages,
      tone: project.options.tone,
    },
  });
}

// DELETE /api/projects/:id — cancel: drain queued jobs and mark the project cancelled.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const c = container();
  const project = await c.repositories.projects.findById(ProjectId.from(params.id));
  if (!project) return error('Not found', 404);
  if (project.ownerId !== userId) return error('Forbidden', 403);

  const removed = await c.queue.drain(params.id); // best-effort: remove not-yet-running jobs
  const cancelled = project.cancel(c.clock.now());
  if (cancelled.isFail()) return error(cancelled.error, 409);
  await c.repositories.projects.save(project);

  return json({ cancelled: true, drainedJobs: removed, status: project.status.value });
}
