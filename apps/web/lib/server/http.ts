import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

/**
 * Wrap a route handler so any thrown error becomes a JSON 500 instead of an
 * empty-body response. Without this, an uncaught exception (bad env, failed DB
 * query, unreachable Redis) escapes to Next's default handler and the client's
 * `res.json()` fails with "Unexpected end of JSON input". The real error is
 * logged to the server (visible in Railway logs) for diagnosis.
 */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal Server Error';
      console.error('[api] unhandled error:', err);
      return error(message, 500);
    }
  };
}

/** Parse + validate a request body against a Zod schema (returns the parsed OUTPUT type). */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: error('Invalid JSON body') };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, res: error(parsed.error.issues.map((i) => i.message).join('; '), 422) };
  return { ok: true, data: parsed.data };
}
