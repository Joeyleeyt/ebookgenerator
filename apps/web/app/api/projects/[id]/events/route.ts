import { ProjectId } from '@yeg/core';
import { container } from '../../../../../lib/server/container.js';
import { getUserId } from '../../../../../lib/server/auth.js';
import { error } from '../../../../../lib/server/http.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/projects/:id/events — Server-Sent Events stream of pipeline progress.
 * Polls the project status (a production build would subscribe to the Redis
 * pub/sub channel published by the workers' QueueEvents bridge).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return error('Unauthorized', 401);

  const repo = container().repositories.projects;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let last = '';
      const send = (data: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      const tick = async (): Promise<boolean> => {
        const project = await repo.findById(ProjectId.from(params.id));
        if (!project || project.ownerId !== userId) {
          send({ error: 'not_found' });
          return true;
        }
        if (project.status.value !== last) {
          last = project.status.value;
          send({ status: last, pending: project.pendingCounts });
        }
        return last === 'COMPLETED' || last === 'FAILED';
      };

      const interval = setInterval(async () => {
        const done = await tick();
        if (done) {
          clearInterval(interval);
          controller.close();
        }
      }, 1500);
      await tick();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
