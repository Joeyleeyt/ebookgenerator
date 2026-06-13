import { z } from 'zod';
import { container } from '../../../../lib/server/container.js';
import { getUserId } from '../../../../lib/server/auth.js';
import { json, error, parseBody } from '../../../../lib/server/http.js';
import { ProjectId } from '@yeg/core';

export const runtime = 'nodejs';

const Body = z.object({ projectId: z.string().uuid(), content: z.string().max(200_000) });

// PATCH /api/book-sections/:id — manual edit of a front/back matter section
// (preface, acknowledgments, introduction, conclusion, …).
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;

  const c = container();
  const project = await c.repositories.projects.findById(ProjectId.from(body.data.projectId));
  if (!project || project.ownerId !== userId) return error('Forbidden', 403);

  const result = await c.useCases.editBookSection.execute({
    projectId: body.data.projectId,
    sectionId: params.id,
    content: body.data.content,
  });
  if (result.isFail()) return error(result.error, 422);
  return json({ saved: true, wordCount: result.value.wordCount });
}
