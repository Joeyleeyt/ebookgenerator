/**
 * Diagnostic: call the 69labs image API directly and print the RAW responses at
 * every stage (enqueue → status poll → download). The production
 * Labs69ImageGenerator collapses a failed job to the opaque string "69labs job
 * failed"; this script shows the provider's actual failure reason so we can tell
 * whether it's billing/credits, an invalid model, content policy, or a bad
 * aspect ratio.
 *
 * Usage:
 *   pnpm exec tsx scripts/test-illustrations.ts ["a custom prompt"]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** Load the repo-root `.env` into process.env (mirrors workers/index.ts). */
function loadDotEnv(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let text: string;
  try {
    text = readFileSync(resolve(root, '.env'), 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const BASE = 'https://69labs.vip/api/v1/images';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  loadDotEnv();
  const apiKey = process.env.LABS69_API_KEY ?? '';
  const model = process.env.LABS69_IMAGE_MODEL ?? 'img-flux';
  const prompt = process.argv[2] ?? 'A serene mountain landscape at sunrise, soft watercolor illustration';

  if (!apiKey) {
    console.error('LABS69_API_KEY is not set (.env or environment).');
    process.exit(1);
  }
  console.log(`key:   ${apiKey.slice(0, 6)}…${apiKey.slice(-4)} (len ${apiKey.length})`);
  console.log(`model: ${model}`);
  console.log(`prompt: ${prompt}\n`);

  const auth = { Authorization: `Bearer ${apiKey}` };

  // 1) Enqueue — illustrations always request 16:9 landscape.
  const body = { prompt, model, aspectRatio: '16:9' };
  console.log('POST /generate', JSON.stringify(body));
  const enqueue = await fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const enqueueText = await enqueue.text();
  console.log(`  ↳ ${enqueue.status} ${enqueue.statusText}`);
  console.log(`  ↳ body: ${enqueueText}\n`);
  if (!enqueue.ok) process.exit(1);

  const job = JSON.parse(enqueueText) as { id?: string };
  if (!job.id) {
    console.error('No job id returned — cannot poll.');
    process.exit(1);
  }

  // 2) Poll — print the FULL status body so any error/reason field is visible.
  const deadline = Date.now() + 180_000;
  let status = '';
  while (Date.now() < deadline) {
    await sleep(1200);
    const res = await fetch(`${BASE}/status/${job.id}`, { headers: auth });
    const text = await res.text();
    console.log(`GET /status/${job.id} → ${res.status}: ${text}`);
    if (!res.ok) {
      if (res.status >= 500) continue;
      process.exit(1);
    }
    const data = JSON.parse(text) as { status?: string };
    status = (data.status ?? '').toUpperCase();
    if (status === 'COMPLETED') break;
    if (['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(status)) {
      console.error(`\nJob ended in ${status}. ^^^ the full status body above is the real failure reason.`);
      process.exit(1);
    }
  }
  if (status !== 'COMPLETED') {
    console.error('Timed out waiting for COMPLETED.');
    process.exit(1);
  }

  // 3) Download.
  const dl = await fetch(`${BASE}/download/${job.id}`, { headers: auth, redirect: 'follow' });
  console.log(`\nGET /download/${job.id} → ${dl.status}, content-type: ${dl.headers.get('content-type')}`);
  const bytes = new Uint8Array(await dl.arrayBuffer());
  console.log(`  ↳ ${bytes.length} bytes received. ✅ Illustration generation works.`);
}

main().catch((e) => {
  console.error('Unexpected error:', e);
  process.exit(1);
});
