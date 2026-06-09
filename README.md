# YouTube Ebook Generator

Turn a YouTube channel into a ~100-page ebook (PDF + DOCX) via an idempotent,
queue-driven pipeline. Built with **Clean Architecture + DDD**.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full design.

## Stack

| Concern | Tech |
|---|---|
| Frontend / API | Next.js (App Router) |
| Domain + Application | `@yeg/core` (zero framework imports) |
| Database / Storage | Supabase (Postgres + Storage, RLS) |
| Background jobs | Redis + BullMQ |
| AI | Anthropic Claude (Haiku → Sonnet → Opus) |
| Metadata / comments | YouTube Data API |
| Transcripts | YouTube Transcript API → Whisper fallback |
| Export | Puppeteer (PDF), `docx` (DOCX) |

## Layout (dependency rule points inward)

```
packages/core            domain/ + application/   ← no framework imports
packages/infrastructure  adapters implement core ports (Supabase, Claude, YouTube, Whisper, BullMQ…)
packages/config          env validation + DI composition root
workers/                 BullMQ processors (one per pipeline stage)
apps/web                 Next.js presentation (route handlers + UI)
supabase/migrations      SQL schema
```

`core` ← `application` ← `infrastructure` / `presentation`. Domain code never
imports Next.js, Supabase, BullMQ, or the Anthropic SDK.

## Pipeline

`SubmitChannel → IngestChannel → FetchVideoData → FetchTranscript (→ Whisper)`
`→ SummarizeVideo (×N, converges) → SummarizeChannel → GenerateOutline`
`→ GenerateChapterTopics → GenerateChapter (×~12) → AssembleEbook → Export`

- **Idempotent**: deterministic `jobId` + `job_runs` ledger + content-hash guard.
- **Retry-safe**: no side effects before the idempotency guard; all writes are upserts.
- **Fan-in barrier**: atomic `decrement_pending(project, stage)` SQL function — no locks.

## Getting started

```bash
pnpm install
cp .env.example .env            # fill in Supabase, Redis, Anthropic, YouTube keys
docker-compose up -d redis      # local Redis
pnpm db:migrate                 # apply supabase/migrations
pnpm --filter @yeg/web dev      # web + API on :3000
pnpm workers:dev                # BullMQ workers (separate terminal)
```

Whisper fallback needs `yt-dlp` + `ffmpeg` on the worker host (bundled in `workers/Dockerfile`).

## Testing

```bash
pnpm --filter @yeg/core test    # pure domain + use-case unit tests
```

Domain entities are pure (no mocks). Use cases test against in-memory port fakes.

## Swapping adapters

Everything is wired in [packages/config/src/container.ts](packages/config/src/container.ts).
To replace Whisper with a self-hosted `faster-whisper` service, implement the
`SpeechToText` port and change one line in the container — no application code changes.
