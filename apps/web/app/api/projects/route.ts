import { SubmitChannelDto } from '@yeg/core';
import { container } from '../../../lib/server/container.js';
import { getUserId } from '../../../lib/server/auth.js';
import { json, error, parseBody, handle } from '../../../lib/server/http.js';

export const runtime = 'nodejs';

// POST /api/projects — submit a YouTube channel for ebook generation.
export const POST = handle(async (req: Request) => {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const body = await parseBody(req, SubmitChannelDto);
  if (!body.ok) return body.res;

  const result = await container().useCases.submitChannel.execute(userId, body.data);
  if (result.isFail()) return error(result.error, 422);
  return json(result.value, 202);
});

// GET /api/projects — list the caller's projects (newest first) plus the
// concurrency budget, so the UI can show "2 of 3 running" without guessing the
// server-side cap.
export const GET = handle(async () => {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);
  const c = container();
  const projects = await c.repositories.projects.listByOwner(userId);
  return json({ projects, limits: { maxActiveProjects: c.env.MAX_ACTIVE_PROJECTS_PER_USER } });
});
