import { z } from 'zod';
import { container } from '../../../../../lib/server/container.js';
import { getUserId } from '../../../../../lib/server/auth.js';
import { json, error, parseBody } from '../../../../../lib/server/http.js';

export const runtime = 'nodejs';

const Body = z.object({ projectId: z.string().uuid(), instructions: z.string().max(2000).optional() });

// POST /api/chapters/:id/regenerate — enqueue a regeneration job for one chapter.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;

  const result = await container().useCases.regenerateChapter.execute({
    projectId: body.data.projectId,
    chapterId: params.id,
    ...(body.data.instructions ? { instructions: body.data.instructions } : {}),
  });
  if (result.isFail()) return error(result.error, 422);
  return json({ accepted: true, inputHash: result.value.inputHash }, 202);
}
