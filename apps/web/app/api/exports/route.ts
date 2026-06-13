import { z } from 'zod';
import { ProjectId, EXPORT_BUCKET } from '@yeg/core';
import { container } from '../../../lib/server/container.js';
import { getUserId } from '../../../lib/server/auth.js';
import { json, error, parseBody } from '../../../lib/server/http.js';

export const runtime = 'nodejs';

const Body = z.object({ projectId: z.string().uuid(), format: z.enum(['pdf', 'docx', 'both']).default('both') });

// POST /api/exports — enqueue an export (re-export after edits).
export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);
  const body = await parseBody(req, Body);
  if (!body.ok) return body.res;

  const c = container();
  const project = await c.repositories.projects.findById(ProjectId.from(body.data.projectId));
  if (!project || project.ownerId !== userId) return error('Forbidden', 403);

  // Unique jobId per request: a re-export after an edit must NOT be deduped against
  // a prior export by the worker's idempotency guard, or the PDF would never rebuild.
  const jobId = `export:${body.data.projectId}:${body.data.format}:${Date.now()}`;
  await c.queue.enqueue('export', body.data, { jobId });
  // Return the version the next export will land at, so the client can poll until an
  // artifact at >= this version appears (i.e. the fresh PDF is ready).
  const nextVersion = (await c.repositories.artifacts.latestVersion(ProjectId.from(body.data.projectId))) + 1;
  return json({ accepted: true, nextVersion }, 202);
}

// GET /api/exports?projectId=... — list export artifacts with signed URLs.
export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);
  const projectId = new URL(req.url).searchParams.get('projectId');
  if (!projectId) return error('projectId required');

  const c = container();
  const project = await c.repositories.projects.findById(ProjectId.from(projectId));
  if (!project || project.ownerId !== userId) return error('Forbidden', 403);

  const artifacts = await c.repositories.artifacts.listByProject(ProjectId.from(projectId));
  // Keep only the freshest artifact per format — re-exports accumulate one row per
  // version, but the client only ever wants the latest PDF/DOCX to download.
  const latestByFormat = new Map<string, (typeof artifacts)[number]>();
  for (const a of artifacts) {
    const prev = latestByFormat.get(a.format);
    if (!prev || a.bookVersion > prev.bookVersion) latestByFormat.set(a.format, a);
  }
  const signed = await Promise.all(
    [...latestByFormat.values()].map(async (a) => {
      const url = await c.storage.signedUrl(EXPORT_BUCKET, a.storagePath, 3600); // 1h
      return { format: a.format, pageCount: a.pageCount, bookVersion: a.bookVersion, path: a.storagePath, url: url.isOk() ? url.value : null };
    }),
  );
  return json({ artifacts: signed });
}
