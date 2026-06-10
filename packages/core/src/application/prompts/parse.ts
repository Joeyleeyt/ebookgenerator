import { Result } from '../../domain/shared/Result.js';
import type { z } from 'zod';

/**
 * Parse a Claude completion that should contain JSON. Tolerates ```json fences
 * and surrounding prose. AI output is validated, never trusted.
 */
// Infer the schema's OUTPUT type (`z.output`), not a single combined type. This
// matters for schemas using `z.preprocess`/transforms, where the input type is
// `unknown` but the parsed output is concrete (e.g. `string[]`) — typing on the
// output gives callers the post-validation shape they actually receive.
export function parseJsonCompletion<S extends z.ZodTypeAny>(text: string, schema: S): Result<z.output<S>> {
  const json = extractJson(text);
  if (!json) return Result.fail('No JSON object found in completion');
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return Result.fail(`Invalid JSON: ${(e as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return Result.fail(`Schema mismatch: ${parsed.error.message}`);
  return Result.ok(parsed.data);
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) return text.slice(start, end + 1);
  return null;
}
