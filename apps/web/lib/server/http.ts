import 'server-only';
import { NextResponse } from 'next/server';
import type { z } from 'zod';

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function error(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status });
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
