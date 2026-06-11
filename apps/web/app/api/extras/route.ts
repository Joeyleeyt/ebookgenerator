import { z } from 'zod';
import { container } from '../../../lib/server/container.js';
import { getUserId } from '../../../lib/server/auth.js';
import { json, error, parseBody } from '../../../lib/server/http.js';

export const runtime = 'nodejs';

const Body = z.object({
  projectId: z.string().uuid(),
  kind: z.enum([
    'dedication',
    'introduction',
    'foreword',
    'conclusion',
    'acknowledgments',
    'faq',
    'bonus_chapter',
    'resources',
    'checklist',
    'glossary',
  ]),
  title: z.string().min(1).max(200),
  prompt: z.string().max(2000).optional(),
});

// POST /api/extras — add Phase 13 extra content (front/back matter).
// Short types generate inline; a bonus_chapter is queued and returns { queued: true }.
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;

  const result = await container().useCases.addExtraContent.execute(body.data);
  if (result.isFail()) return error(result.error, 422);
  return json({ sectionId: result.value.sectionId, queued: result.value.queued }, 201);
}
