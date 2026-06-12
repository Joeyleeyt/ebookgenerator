import { Result, type ImageGenerator, type GeneratedImage } from '@yeg/core';

/**
 * Image generator backed by the 69labs API (default model "nano-banana-2").
 * Used ONLY for the in-chapter illustrations; the cover uses OpenAI gpt-image-1.
 *
 * 69labs generation is asynchronous, so one call to `generate` runs the whole
 * job lifecycle behind the synchronous port:
 *   1. POST /api/v1/images/generate          → { id, queuePosition }
 *   2. poll GET /api/v1/images/status/:id     → until status === "COMPLETED"
 *   3. GET  /api/v1/images/download/:id        → 302 → presigned URL → raw bytes
 * Auth is a bearer token on every request. Any failure (HTTP error, job failure,
 * timeout) returns Result.fail so the caller can skip that illustration.
 */
export class Labs69ImageGenerator implements ImageGenerator {
  private static readonly BASE = 'https://69labs.vip/api/v1/images';

  constructor(
    private readonly apiKey: string,
    private readonly model = 'img-flux',
    // Poll fairly tightly: img-flux finishes in ~10s, so a long interval would add
    // noticeable dead time after the image is already ready.
    private readonly pollIntervalMs = 1200,
    private readonly timeoutMs = 180_000,
  ) {}

  static fromApiKey(apiKey: string, model?: string): Labs69ImageGenerator {
    return new Labs69ImageGenerator(apiKey, model);
  }

  async generate(input: { prompt: string; size?: string }): Promise<Result<GeneratedImage>> {
    if (!this.apiKey) return Result.fail('LABS69_API_KEY is not configured');
    const auth = { Authorization: `Bearer ${this.apiKey}` };
    try {
      // 1) Enqueue the job.
      const body: Record<string, unknown> = { prompt: input.prompt, model: this.model };
      const aspectRatio = aspectRatioFor(input.size);
      if (aspectRatio) body.aspectRatio = aspectRatio;

      const enqueue = await fetch(`${Labs69ImageGenerator.BASE}/generate`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!enqueue.ok) {
        return Result.fail(`69labs generate ${enqueue.status}: ${(await safeText(enqueue)).slice(0, 300)}`);
      }
      const job = (await enqueue.json()) as { id?: string };
      if (!job.id) return Result.fail('69labs generate returned no job id');

      // 2) Poll until the job reaches a terminal state.
      const deadline = Date.now() + this.timeoutMs;
      let status = '';
      let format = 'png';
      while (Date.now() < deadline) {
        await sleep(this.pollIntervalMs);
        const res = await fetch(`${Labs69ImageGenerator.BASE}/status/${job.id}`, { headers: auth });
        if (!res.ok) {
          if (res.status >= 500) continue; // transient — keep polling
          return Result.fail(`69labs status ${res.status}`);
        }
        const data = (await res.json()) as { status?: string; outputMetadata?: { format?: string } };
        status = (data.status ?? '').toUpperCase();
        if (data.outputMetadata?.format) format = data.outputMetadata.format;
        if (status === 'COMPLETED') break;
        if (['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(status)) {
          return Result.fail(`69labs job ${status.toLowerCase()}`);
        }
      }
      if (status !== 'COMPLETED') return Result.fail('69labs job timed out');

      // 3) Download the output. The endpoint 302-redirects to a presigned URL;
      // fetch follows it (and drops the bearer header cross-origin, which the
      // presigned URL doesn't need).
      const dl = await fetch(`${Labs69ImageGenerator.BASE}/download/${job.id}`, {
        headers: auth,
        redirect: 'follow',
      });
      if (!dl.ok) return Result.fail(`69labs download ${dl.status}`);
      const bytes = new Uint8Array(await dl.arrayBuffer());
      const contentType = normalizeContentType(dl.headers.get('content-type'), format);
      return Result.ok({ bytes, contentType });
    } catch (e) {
      return Result.fail(e instanceof Error ? e.message : String(e));
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

/** Map a legacy "WxH" size hint to a 69labs aspect-ratio string. */
function aspectRatioFor(size?: string): string | null {
  const m = size ? /^(\d+)x(\d+)$/.exec(size) : null;
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w > h) return '16:9'; // landscape (illustrations)
  if (h > w) return '9:16'; // portrait
  return '1:1';
}

/** Prefer the download's own content-type; fall back to the job's reported format. */
function normalizeContentType(header: string | null, format: string): string {
  if (header && header.startsWith('image/')) return header;
  const f = format.toLowerCase();
  return f === 'jpg' || f === 'jpeg' ? 'image/jpeg' : `image/${f || 'png'}`;
}
