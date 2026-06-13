import { z } from 'zod';

/** Single source of truth for environment configuration — validated at startup. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Single-administrator app: only this account is allowed to sign in.
  ADMIN_EMAIL: z.string().email(),

  REDIS_URL: z.string().min(1),

  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MAX_TPM: z.coerce.number().int().positive().default(80_000),

  YOUTUBE_API_KEY: z.string().min(1),

  WHISPER_PROVIDER: z.enum(['openai', 'self-hosted']).default('openai'),
  OPENAI_API_KEY: z.string().optional(),

  // 69labs — generates ONLY the in-chapter illustrations. If unset, books carry
  // no illustrations.
  LABS69_API_KEY: z.string().optional(),
  // Which 69labs model to use for illustrations. Defaults to "nano-banana-2"
  // (higher quality, same 1-credit cost, ~38s/image). "img-flux" (Flux Schnell)
  // is faster (~10s) but lower quality; "nano-banana-pro" is 2 credits.
  LABS69_IMAGE_MODEL: z.string().default('nano-banana-2'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  cached = parsed.data;
  return cached;
}
