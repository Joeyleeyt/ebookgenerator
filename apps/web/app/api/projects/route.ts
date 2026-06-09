import { SubmitChannelDto } from '@yeg/core';
import { container } from '../../../lib/server/container.js';
import { getUserId } from '../../../lib/server/auth.js';
import { json, error, parseBody } from '../../../lib/server/http.js';

export const runtime = 'nodejs';

// POST /api/projects — submit a YouTube channel for ebook generation.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const body = await parseBody(req, SubmitChannelDto);
  if (!body.ok) return body.res;

  const result = await container().useCases.submitChannel.execute(userId, body.data);
  if (result.isFail()) return error(result.error, 422);
  return json(result.value, 202);
}

// GET /api/projects — list the caller's projects (newest first).
export async function GET() {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);
  const projects = await container().repositories.projects.listByOwner(userId);
  return json({ projects });
}
