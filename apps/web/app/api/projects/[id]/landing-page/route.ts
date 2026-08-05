import { LandingSettingsDto, ProjectId } from '@yeg/core';
import { container } from '../../../../../lib/server/container.js';
import { getUserId } from '../../../../../lib/server/auth.js';
import { json, error, parseBody, handle } from '../../../../../lib/server/http.js';

export const runtime = 'nodejs';

/** Load the project and confirm the caller owns it. */
async function authorize(id: string) {
  const userId = await getUserId();
  if (!userId) return { res: error('Unauthorized', 401) } as const;
  const c = container();
  const project = await c.repositories.projects.findById(ProjectId.from(id));
  if (!project) return { res: error('Not found', 404) } as const;
  if (project.ownerId !== userId) return { res: error('Forbidden', 403) } as const;
  return { c, project } as const;
}

// GET /api/projects/:id/landing-page — settings + current draft/published state.
export const GET = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const auth = await authorize(params.id);
  if ('res' in auth) return auth.res;
  const { c, project } = auth;

  const page = await c.repositories.landingPages.findByProject(ProjectId.from(params.id));
  return json({
    settings: {
      enabled: project.options.landingPage,
      checkoutUrl: project.options.landingCheckoutUrl ?? '',
      templateUrl: project.options.landingTemplateUrl ?? '',
      priceCents: project.options.landingPriceCents ?? null,
      compareAtCents: project.options.landingCompareAtCents ?? null,
      currency: project.options.landingCurrency,
      guaranteeDays: project.options.landingGuaranteeDays,
      mode: project.options.landingMode,
      siblings: project.options.landingSiblings.map((s) => ({
        projectId: s.projectId,
        priceCents: s.priceCents ?? null,
        checkoutUrl: s.checkoutUrl ?? '',
      })),
      bundlePriceCents: project.options.landingBundlePriceCents ?? null,
      bundleCheckoutUrl: project.options.landingBundleCheckoutUrl ?? '',
      authorPhotoPath: project.options.landingAuthorPhotoPath ?? '',
    },
    page: page
      ? {
          state: page.state,
          url: page.url,
          error: page.error,
          hasDraft: page.html !== null,
          updatedAt: page.updatedAt.toISOString(),
        }
      : null,
    // Surfaced so the UI can explain a disabled Publish button instead of
    // failing the request after the user clicks it.
    canPublish: c.sitePublisher.isConfigured() && project.options.missingCheckoutPositions().length === 0,
    // Which books still need a buy link, so the UI can name them rather than
    // just greying the button out.
    missingCheckoutPositions: project.options.missingCheckoutPositions(),
    publisherConfigured: c.sitePublisher.isConfigured(),
  });
});

// PATCH /api/projects/:id/landing-page — update price / checkout link / guarantee.
export const PATCH = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const auth = await authorize(params.id);
  if ('res' in auth) return auth.res;
  const { c, project } = auth;

  const body = await parseBody(req, LandingSettingsDto);
  if (!body.ok) return body.res;

  project.updateLandingSettings(body.data, c.clock.now());
  await c.repositories.projects.save(project);
  return json({ saved: true });
});

// POST /api/projects/:id/landing-page — (re)generate the draft, optionally publishing.
export const POST = handle(async (req: Request, { params }: { params: { id: string } }) => {
  const auth = await authorize(params.id);
  if ('res' in auth) return auth.res;
  const { c, project } = auth;

  if (project.status.value !== 'COMPLETED') {
    return error('The book must finish generating before its landing page can be written', 409);
  }

  const params_ = new URL(req.url).searchParams;
  const publish = params_.get('publish') === 'true';
  // Opt-in: without it the stored layout is reused, which is what keeps every
  // page on a template identical.
  const rebuildLayout = params_.get('rebuildLayout') === 'true';
  const missingCheckout = project.options.missingCheckoutPositions();
  if (publish && missingCheckout.length > 0) {
    return error(
      project.options.isTripleLanding
        ? `Add a checkout link for ${missingCheckout.length === 1 ? 'book' : 'books'} ${missingCheckout.join(', ')} before publishing`
        : 'Add your checkout link before publishing',
      422,
    );
  }

  // Queued rather than run inline: an Opus call plus a Netlify deploy is well
  // past a request's lifetime, and this way it retries like everything else.
  await c.queue.enqueue(
    'landing-page',
    { projectId: params.id, mode: 'generate', publish, rebuildLayout },
    { jobId: `landing-page:${params.id}:manual:${Date.now()}` },
  );
  return json({ queued: true, willPublish: publish, rebuildLayout }, 202);
});

// PUT /api/projects/:id/landing-page — publish the existing draft as-is.
export const PUT = handle(async (_req: Request, { params }: { params: { id: string } }) => {
  const auth = await authorize(params.id);
  if ('res' in auth) return auth.res;
  const { c, project } = auth;

  if (!project.options.hasCheckoutUrl) return error('Add your checkout link before publishing', 422);

  const page = await c.repositories.landingPages.findByProject(ProjectId.from(params.id));
  if (!page?.html) return error('Generate the page before publishing it', 409);

  await c.queue.enqueue(
    'landing-page',
    { projectId: params.id, mode: 'publish', publish: true },
    { jobId: `landing-page:${params.id}:publish:${Date.now()}` },
  );
  return json({ queued: true }, 202);
});
