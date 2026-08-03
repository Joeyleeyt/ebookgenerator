import { ProjectId } from '@yeg/core';
import { container } from '../../../../../../lib/server/container.js';
import { getUserId } from '../../../../../../lib/server/auth.js';
import { error } from '../../../../../../lib/server/http.js';

export const runtime = 'nodejs';

/**
 * GET /api/projects/:id/landing-page/preview — the draft page itself, so the
 * user reads the real thing (in an iframe or a new tab) before publishing it.
 *
 * Served with a sandboxing CSP: the draft is generated HTML, and although the
 * renderer escapes everything, the preview runs on the app's own origin — where
 * the user's session cookie lives. The published page has no such neighbour.
 *
 * Inline script is permitted because the page's scroll reveals need it, and
 * because every script on the page is written by our own renderer — model prose
 * and the user's checkout URL are escaped into text and attribute context and
 * can never reach a script. The sandbox still withholds `allow-same-origin`, so
 * even if that reasoning were wrong the page runs in an opaque origin with no
 * access to the session cookie it sits beside.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const c = container();
  const project = await c.repositories.projects.findById(ProjectId.from(params.id));
  if (!project) return error('Not found', 404);
  if (project.ownerId !== userId) return error('Forbidden', 403);

  const page = await c.repositories.landingPages.findByProject(ProjectId.from(params.id));
  if (!page?.html) return error('No draft yet', 404);

  return new Response(page.html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; " +
        "form-action 'none'; sandbox allow-scripts allow-popups",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
