import { ProjectId } from '@yeg/core';
import { container } from '../../../../../lib/server/container.js';
import { getUserId } from '../../../../../lib/server/auth.js';
import { json, error } from '../../../../../lib/server/http.js';

export const runtime = 'nodejs';

// POST /api/projects/:id/retry — re-enqueue failed stages of a FAILED project.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const c = container();
  const project = await c.repositories.projects.findById(ProjectId.from(params.id));
  if (!project) return error('Not found', 404);
  if (project.ownerId !== userId) return error('Forbidden', 403);

  const { retried, stage } = await c.orchestrator.resume(params.id);
  if (retried === 0) return error('Nothing to retry (project is not in a retryable failed state)', 409);

  return json({ retried, stage: stage ?? null }, 202);
}
