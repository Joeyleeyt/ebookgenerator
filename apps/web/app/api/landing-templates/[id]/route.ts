import { z } from 'zod';
import { container } from '../../../../lib/server/container.js';
import { getUserId } from '../../../../lib/server/auth.js';
import { json, error, parseBody, handle } from '../../../../lib/server/http.js';

export const runtime = 'nodejs';

/**
 * A correction to what the annotation call decided.
 *
 * Kept as intent rather than as a node id: ids move when the source page
 * changes, but "this text is the hero subtitle" survives a re-extraction, which
 * is what lets review work be re-applied instead of redone.
 */
const OverridesDto = z.object({
  overrides: z
    .array(
      z.object({
        placeholder: z.string().max(120),
        action: z.enum(['relabel', 'keep', 'remove']),
        replacement: z.string().max(120).optional(),
        matchText: z.string().max(400).optional(),
      }),
    )
    .max(200),
});

async function authorize(id: string) {
  const userId = await getUserId();
  if (!userId) return { res: error('Unauthorized', 401) } as const;
  const c = container();
  const template = await c.repositories.landingTemplates.findById(id);
  if (!template) return { res: error('Not found', 404) } as const;
  if (template.ownerId !== userId) return { res: error('Forbidden', 403) } as const;
  return { c, template } as const;
}

/**
 * GET /api/landing-templates/:id — everything the review screen needs.
 *
 * The placeholder table with each node's ORIGINAL text is the important part:
 * it is how a user confirms the labelling without reading HTML, and the only
 * practical check on whether the model labelled the right nodes.
 */
export const GET = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const auth = await authorize(params.id);
  if ('res' in auth) return auth.res;
  const { c, template } = auth;

  const assets = await c.repositories.landingTemplates.listAssets(template.id);

  return json({
    id: template.id,
    sourceUrl: template.sourceUrl,
    name: template.name,
    state: template.state,
    revision: template.revision,
    capturedAt: template.capturedAt?.toISOString() ?? null,
    failureReason: template.failureReason,
    theme: {
      accentToken: template.theme.accentToken,
      accentValue: template.theme.accentValue,
      onAccentValue: template.theme.onAccentValue,
      isDark: template.theme.isDark,
    },
    placeholders: template.placeholders.map((p) => ({
      placeholder: p.placeholder,
      kind: p.kind,
      maxChars: p.maxChars,
      originalText: p.originalText,
      // Replacing this node's text will drop inline markup it contained — an
      // accent span inside a heading, usually. Visible rather than discovered.
      losesInlineMarkup: p.hadInlineMarkup,
    })),
    repeaters: template.repeaters.map((r) => ({
      key: r.key,
      originalCount: r.originalCount,
      // False means the container is a hand-tuned row rather than a reflowing
      // grid, so the item count is fixed at the template's own.
      flexibleCount: r.flexibleCount,
      fields: r.fields,
    })),
    overrides: template.overrides,
    report: template.report,
    responsive: { widths: template.responsive.widths, breakpoints: template.responsive.breakpoints },
    assets: {
      count: assets.length,
      bytes: assets.reduce((total, a) => total + a.byteSize, 0),
      degradedFonts: assets.filter((a) => a.kind === 'font' && !a.rehosted).length,
    },
  });
});

// PATCH /api/landing-templates/:id — record corrections to the labelling.
export const PATCH = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const auth = await authorize(params.id);
  if ('res' in auth) return auth.res;
  const { c, template } = auth;

  const body = await parseBody(req, OverridesDto);
  if (!body.ok) return body.res;

  const saved = await c.repositories.landingTemplates.saveOverrides(template.id, body.data.overrides);
  if (saved.isFail()) return error(saved.error, 500);
  return json({ saved: true, appliedOnNextExtraction: true });
});

// DELETE /api/landing-templates/:id
export const DELETE = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const auth = await authorize(params.id);
  if ('res' in auth) return auth.res;
  const { c, template } = auth;

  const removed = await c.repositories.landingTemplates.remove(template.id);
  if (removed.isFail()) return error(removed.error, 500);
  return json({ deleted: true });
});
