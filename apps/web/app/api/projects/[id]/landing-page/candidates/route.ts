import { ProjectId } from '@yeg/core';
import { container } from '../../../../../../lib/server/container.js';
import { getUserId } from '../../../../../../lib/server/auth.js';
import { json, error, handle } from '../../../../../../lib/server/http.js';

export const runtime = 'nodejs';

/**
 * GET /api/projects/:id/landing-page/candidates
 *
 * The user's other finished books, for the three-book page's picker. Scoped to
 * the signed-in owner in the query itself — the caller never gets to say whose
 * books to list.
 */
export const GET = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const c = container();
  const projectId = ProjectId.from(params.id);
  const project = await c.repositories.projects.findById(projectId);
  if (!project) return error('Not found', 404);
  if (project.ownerId !== userId) return error('Forbidden', 403);

  const candidates = await c.repositories.projects.listLandingCandidates(userId, projectId);

  return json({
    candidates: candidates.map((candidate) => ({
      projectId: candidate.projectId,
      title: candidate.bookTitle,
      channelUrl: candidate.channelUrl,
      // Same channel as this project's — the picker defaults to these, since a
      // page carries one creator's avatar and one author bio.
      sameChannel: candidate.channelUrl === project.channelUrl.raw,
      createdAt: candidate.createdAt,
    })),
  });
});
