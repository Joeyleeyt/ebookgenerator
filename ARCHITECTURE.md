# YouTube Ebook Generator — Production Architecture

> Clean Architecture + DDD · TypeScript · Next.js · Supabase · Redis/BullMQ · Anthropic Claude · YouTube Data/Transcript APIs · Whisper fallback

A SaaS that turns a YouTube channel into a ~100‑page ebook (PDF + DOCX) through an idempotent, retry‑safe, queue‑driven pipeline.

> **Pipeline source of truth:** the implemented pipeline follows the **15‑phase
> flow in [`logic.md`](logic.md)** (knowledge extraction → comment analysis →
> channel knowledge base → book strategy → outline → chapter research → chapter
> writing → polishing). This document has been reconciled to that flow; where an
> older 11‑stage description lingered, the 15‑phase version below is authoritative.

---

## 0. Design Principles & Key Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Architecture | Clean Architecture, 4 layers, dependency rule points inward | Domain has zero framework imports; everything else depends on abstractions |
| Modeling | DDD aggregates with invariants enforced in entities | Pipeline correctness lives in the domain, not in workers |
| AI provider | Anthropic Claude only; tiered models | Cost/latency control: Haiku → cheap, Sonnet → summaries, Opus → long-form chapters |
| Transcripts | YouTube Transcript API first, Whisper fallback | Whisper (audio download + ASR) is expensive; only used when captions absent |
| No vector DB | Map‑reduce summarization + hierarchical context | 30–50 videos fit a deterministic reduce tree; embeddings not needed for this workload |
| Background work | Redis + BullMQ, one queue per pipeline stage | Independent scaling, isolated retry policy, backpressure per stage |
| Idempotency | Deterministic `jobId` + DB `state` guard + content hash | Re-running a stage is a no-op if output already exists |
| Persistence | Supabase Postgres (RLS) + Storage (audio/exports) | Single managed stack, row-level multi-tenancy |
| Validation | Zod DTOs at every boundary (HTTP, queue payloads, AI output) | Strong typing end-to-end; AI output is parsed, not trusted |
| DI | Constructor injection via a typed composition root (Awilix or hand-rolled) | Testable services, swappable adapters |

**Claude model routing** (exact IDs):
- `claude-haiku-4-5` — comment analysis / audience psychology extraction, cheap classification.
- `claude-sonnet-4-6` — video knowledge extraction, channel knowledge base, book strategy, outline, chapter research.
- `claude-opus-4-8` — chapter prose, book polishing, chapter regeneration, bonus sections (long-form quality).

Prompt-cache the large shared context (channel summary + outline) so every chapter generation reuses it.

---

## 1. Folder Structure

Monorepo, but a single Next.js app can host both the web UI and the worker entrypoints. The `core` package is framework-free.

```
youtube-ebook-generator/
├─ apps/
│  └─ web/                              # Next.js (App Router) — Presentation
│     ├─ app/
│     │  ├─ (marketing)/page.tsx
│     │  ├─ (dashboard)/
│     │  │  ├─ projects/page.tsx
│     │  │  ├─ projects/[id]/page.tsx        # live pipeline status (SSE)
│     │  │  └─ projects/[id]/editor/page.tsx # chapter editor / regenerate
│     │  └─ api/                              # Route Handlers (thin controllers)
│     │     ├─ projects/route.ts
│     │     ├─ projects/[id]/route.ts
│     │     ├─ projects/[id]/events/route.ts # SSE stream
│     │     ├─ chapters/[id]/regenerate/route.ts
│     │     ├─ sections/route.ts
│     │     ├─ exports/route.ts
│     │     └─ webhooks/stripe/route.ts
│     ├─ components/
│     ├─ lib/server/container.ts             # request-scoped DI resolution
│     └─ middleware.ts                        # Supabase auth/session
│
├─ workers/                            # BullMQ process entrypoints (one per pod, or grouped)
│  ├─ index.ts                         # boots all workers + QueueEvents bridge + graceful shutdown
│  ├─ runtime/worker-factory.ts        # uniform idempotency/retry wrapper + stage telemetry
│  └─ processors/index.ts              # buildWorkers(): thin handlers for all 15 stage queues
│                                      #   (channel-ingest, video-data, transcript-fetch,
│                                      #    whisper-transcribe, video-summarize, analyze-comments,
│                                      #    knowledge-base, book-strategy, outline-generate,
│                                      #    chapter-research, chapter-generate, polish-book,
│                                      #    extra-content, ebook-assemble, export)
│
├─ packages/
│  ├─ core/                            # ── DOMAIN + APPLICATION (no framework imports) ──
│  │  ├─ domain/
│  │  │  ├─ shared/
│  │  │  │  ├─ Entity.ts
│  │  │  │  ├─ AggregateRoot.ts
│  │  │  │  ├─ ValueObject.ts
│  │  │  │  ├─ DomainEvent.ts
│  │  │  │  ├─ Result.ts                 # Result<T, E> — no throwing in domain
│  │  │  │  └─ Guard.ts
│  │  │  ├─ project/
│  │  │  │  ├─ Project.ts                # aggregate root
│  │  │  │  ├─ ProjectStatus.ts          # state machine VO
│  │  │  │  ├─ ProjectId.ts
│  │  │  │  └─ events/ProjectStatusChanged.ts
│  │  │  ├─ channel/
│  │  │  │  ├─ Channel.ts
│  │  │  │  ├─ ChannelUrl.ts             # VO: parse/validate
│  │  │  │  └─ ChannelSummary.ts
│  │  │  ├─ video/
│  │  │  │  ├─ Video.ts                  # aggregate root (transcript, comments, summary)
│  │  │  │  ├─ VideoId.ts
│  │  │  │  ├─ Transcript.ts             # entity (source: youtube|whisper)
│  │  │  │  ├─ TranscriptSource.ts
│  │  │  │  ├─ Comment.ts
│  │  │  │  └─ VideoSummary.ts
│  │  │  ├─ book/
│  │  │  │  ├─ Book.ts                   # aggregate root
│  │  │  │  ├─ Outline.ts
│  │  │  │  ├─ Chapter.ts                # entity
│  │  │  │  ├─ Section.ts                # entity
│  │  │  │  ├─ PageBudget.ts             # VO: page→word targets
│  │  │  │  └─ events/ChapterGenerated.ts
│  │  │  └─ export/
│  │  │     ├─ ExportArtifact.ts
│  │  │     └─ ExportFormat.ts
│  │  │
│  │  ├─ application/
│  │  │  ├─ ports/                       # interfaces (the "dependency inversion" boundary)
│  │  │  │  ├─ repositories/
│  │  │  │  │  ├─ ProjectRepository.ts
│  │  │  │  │  ├─ VideoRepository.ts
│  │  │  │  │  ├─ BookRepository.ts
│  │  │  │  │  └─ UnitOfWork.ts
│  │  │  │  ├─ services/
│  │  │  │  │  ├─ AiTextGenerator.ts     # Claude abstraction
│  │  │  │  │  ├─ YouTubeMetadataProvider.ts
│  │  │  │  │  ├─ TranscriptProvider.ts
│  │  │  │  │  ├─ SpeechToText.ts        # Whisper
│  │  │  │  │  ├─ AudioDownloader.ts
│  │  │  │  │  ├─ ObjectStorage.ts
│  │  │  │  │  ├─ DocumentExporter.ts    # PDF/DOCX
│  │  │  │  │  └─ JobQueue.ts            # enqueue abstraction
│  │  │  │  └─ Clock.ts / IdGenerator.ts / Logger.ts
│  │  │  ├─ dto/                         # Zod schemas + inferred types
│  │  │  ├─ use-cases/                   # 15-phase pipeline (see logic.md)
│  │  │  │  ├─ SubmitChannelUseCase.ts
│  │  │  │  ├─ IngestChannelUseCase.ts
│  │  │  │  ├─ FetchVideoDataUseCase.ts
│  │  │  │  ├─ FetchTranscriptUseCase.ts
│  │  │  │  ├─ TranscribeAudioUseCase.ts
│  │  │  │  ├─ SummarizeVideoUseCase.ts        # Phase 5 — knowledge extraction
│  │  │  │  ├─ AnalyzeCommentsUseCase.ts       # Phase 6
│  │  │  │  ├─ BuildKnowledgeBaseUseCase.ts    # Phase 7 (reduce)
│  │  │  │  ├─ GenerateBookStrategyUseCase.ts  # Phase 8
│  │  │  │  ├─ GenerateOutlineUseCase.ts       # Phase 9
│  │  │  │  ├─ GenerateChapterResearchUseCase.ts # Phase 10
│  │  │  │  ├─ StartChapterGenerationUseCase.ts  # fan-out controller
│  │  │  │  ├─ GenerateChapterUseCase.ts       # Phase 11
│  │  │  │  ├─ StartBookPolishUseCase.ts       # Phase 12 fan-out controller
│  │  │  │  ├─ PolishChapterUseCase.ts         # Phase 12 (per-chapter, parallel)
│  │  │  │  ├─ AddExtraContentUseCase.ts       # Phase 13 (front/back matter)
│  │  │  │  ├─ GenerateExtraContentUseCase.ts  # Phase 13 (bonus chapters)
│  │  │  │  ├─ AssembleEbookUseCase.ts         # Phase 14
│  │  │  │  ├─ ExportEbookUseCase.ts           # Phase 15
│  │  │  │  ├─ RegenerateChapterUseCase.ts
│  │  │  │  ├─ EditChapterUseCase.ts           # manual PATCH edit
│  │  │  │  └─ AddSectionUseCase.ts
│  │  │  └─ pipeline/PipelineOrchestrator.ts  # advances state, enqueues next stage, resume()
│  │  └─ index.ts
│  │
│  ├─ infrastructure/                   # ── INFRASTRUCTURE (adapters implement ports) ──
│  │  ├─ persistence/supabase/
│  │  │  ├─ SupabaseClientFactory.ts
│  │  │  ├─ mappers/                     # domain ⇄ row
│  │  │  ├─ SupabaseProjectRepository.ts
│  │  │  ├─ SupabaseVideoRepository.ts
│  │  │  ├─ SupabaseBookRepository.ts
│  │  │  └─ SupabaseUnitOfWork.ts
│  │  ├─ ai/anthropic/
│  │  │  ├─ ClaudeTextGenerator.ts
│  │  │  ├─ prompts/                     # versioned prompt templates
│  │  │  └─ ClaudeResponseParser.ts
│  │  ├─ youtube/
│  │  │  ├─ YouTubeDataApiProvider.ts
│  │  │  └─ YouTubeTranscriptProvider.ts
│  │  ├─ whisper/
│  │  │  ├─ WhisperSpeechToText.ts       # OpenAI Whisper or self-hosted faster-whisper
│  │  │  └─ YtDlpAudioDownloader.ts
│  │  ├─ storage/SupabaseStorageAdapter.ts
│  │  ├─ export/
│  │  │  ├─ PuppeteerPdfExporter.ts
│  │  │  └─ DocxExporter.ts
│  │  ├─ queue/
│  │  │  ├─ BullJobQueue.ts
│  │  │  ├─ queues.ts                    # queue registry + names
│  │  │  └─ connection.ts                # ioredis singleton
│  │  └─ observability/{PinoLogger,Telemetry}.ts
│  │
│  └─ config/
│     ├─ env.ts                          # Zod-validated process.env
│     └─ container.ts                    # composition root (DI wiring)
│
├─ supabase/
│  ├─ migrations/                        # SQL DDL (section 9)
│  └─ seed.sql
├─ tests/{unit,integration,e2e}/
├─ docker-compose.yml                    # redis + worker for local dev
├─ turbo.json · tsconfig.base.json · package.json
```

**Dependency rule:** `domain` ← `application` ← `infrastructure`/`presentation`. `core` never imports `infrastructure`, Next.js, Supabase, BullMQ, or the Anthropic SDK.

---

## 2. Database Schema (conceptual)

One Postgres database, multi-tenant via `user_id` + RLS. Eleven core tables.

```
users (Supabase auth.users)
  └─ projects                 1 user → N projects (one ebook generation per project)
       ├─ channels            1 project → 1 channel snapshot
       ├─ videos              1 project → 30–50 videos
       │    ├─ transcripts    1 video  → 1 transcript (youtube|whisper)
       │    ├─ comments       1 video  → N comments (top N)
       │    └─ video_summaries 1 video → 1 summary
       ├─ channel_summaries   1 project → 1
       ├─ books               1 project → 1
       │    ├─ chapters       1 book → ~10–14 chapters
       │    │    └─ sections  1 chapter → N sections
       │    └─ outlines       1 book → 1 (versioned)
       └─ export_artifacts    1 project → N (pdf, docx, versions)

job_runs                      audit/idempotency ledger for every queue job
```

Key design points:
- **`projects.status`** drives the pipeline state machine (section 3.3).
- **`*_hash` columns** store a content hash of inputs so a worker can detect "already produced for these inputs" and skip.
- **`job_runs`** gives idempotency + observability: `(job_key)` unique, stores `state`, `attempt`, `result_ref`.
- Chapters/sections carry `position` for ordering and `status` for partial regeneration.

Full SQL in **section 9**.

---

## 3. Service Architecture

### 3.1 Layered service map

```
┌─────────────────────────── Presentation (Next.js) ───────────────────────────┐
│  Route Handlers (controllers)  ·  SSE status stream  ·  React editor UI       │
│  → validate DTO (Zod) → resolve use case from container → return DTO          │
└───────────────┬───────────────────────────────────────────────────────────────┘
                │ (calls)
┌───────────────▼─────────────────── Application ───────────────────────────────┐
│  Use Cases (orchestration)   PipelineOrchestrator (state + enqueue)           │
│  Ports: AiTextGenerator · YouTubeMetadataProvider · TranscriptProvider ·      │
│         SpeechToText · ObjectStorage · DocumentExporter · JobQueue · Repos     │
└───────────────┬─────────────────────────────────────┬─────────────────────────┘
        (implements)                            (implements)
┌───────────────▼──────────┐          ┌────────────────▼──────────────────────────┐
│  Infrastructure adapters │          │  Domain (entities, VOs, invariants, events)│
│  Supabase · Anthropic ·  │          │  Project · Video · Book · Chapter · Section│
│  YouTube · Whisper ·     │          └────────────────────────────────────────────┘
│  Puppeteer/docx · BullMQ │
└──────────────────────────┘
```

### 3.2 Core service responsibilities (ports)

```typescript
// application/ports/services/AiTextGenerator.ts
export interface AiTextGenerator {
  generate(input: {
    model: 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-8';
    system: string;
    messages: AiMessage[];
    maxTokens: number;
    cacheControl?: { systemPrefix?: boolean }; // prompt caching for shared context
    metadata?: { projectId: string; stage: string };
  }): Promise<Result<AiCompletion, AiError>>;
}

// application/ports/services/TranscriptProvider.ts
export interface TranscriptProvider {
  // returns null (not error) when no captions exist → triggers Whisper fallback
  fetch(videoId: VideoId): Promise<Result<RawTranscript | null, TranscriptError>>;
}

// application/ports/services/SpeechToText.ts
export interface SpeechToText {
  transcribe(audioRef: StorageRef): Promise<Result<RawTranscript, SttError>>;
}

// application/ports/repositories/ProjectRepository.ts
export interface ProjectRepository {
  findById(id: ProjectId): Promise<Project | null>;
  save(project: Project): Promise<void>;           // upsert + optimistic version
  updateStatus(id: ProjectId, status: ProjectStatus, expectedVersion: number): Promise<void>;
}
```

### 3.3 Pipeline state machine

`projects.status` transitions. Each transition is performed *only* after a stage's output is persisted, then the next job is enqueued.

```
CREATED
  → INGESTING_CHANNEL            (fetch channel + score/select top ~30 videos)
  → FETCHING_VIDEO_DATA          (metadata + comments per video; fan-out)
  → FETCHING_TRANSCRIPTS         (transcript API; fan-out)         ┐
  → TRANSCRIBING_FALLBACK        (Whisper only for missing ones)   ┘ (conditional)
  → SUMMARIZING_VIDEOS           (per-video knowledge extraction; fan-out)  ┐ per-video
  → ANALYZING_COMMENTS           (audience comment insights; fan-out)       ┘ chain (barrier)
  → BUILDING_KNOWLEDGE_BASE      (reduce → channel knowledge base)
  → GENERATING_BOOK_STRATEGY     (title, subtitle, promise, audience, voice)
  → GENERATING_OUTLINE           (~12 chapters w/ promise + key points)
  → GENERATING_CHAPTER_RESEARCH  (per-chapter research package; fan-out, barrier)
  → GENERATING_CHAPTERS          (per-chapter prose; fan-out, bounded)
  → POLISHING_BOOK               (whole-manuscript consistency pass)
  → ASSEMBLING                   (front/back matter + chapters)
  → EXPORTING                    (PDF + DOCX)
  → COMPLETED
  (any) → FAILED                 (terminal after retries exhausted; POST /retry rewinds & re-enqueues)
  (any) → PARTIAL                (some videos failed but threshold met → continue)
```

The `PipelineOrchestrator` is the single component allowed to enqueue "next stage" jobs. It uses **counters** (`projects.pending_counts` per stage) to implement the **fan-in barrier**: each child job decrements; when it hits zero, the orchestrator advances. Two barriers span multiple phases: the **per-video chain** (`SUMMARIZING_VIDEOS` → `ANALYZING_COMMENTS`) converges on a single `VIDEO_PIPELINE` counter before `BUILDING_KNOWLEDGE_BASE`, and the **chapter-research** fan-out converges before `GENERATING_CHAPTERS`. This is the only coordination primitive needed — no distributed locks. `PipelineOrchestrator.resume(projectId)` powers `POST /api/projects/:id/retry`: it rewinds a `FAILED` project to the earliest failed stage and re-runs that stage's failed BullMQ jobs (original payloads preserved).

```typescript
// application/pipeline/PipelineOrchestrator.ts (essence)
async onStageItemCompleted(projectId, stage) {
  const remaining = await this.repo.decrementPending(projectId, stage); // atomic SQL
  if (remaining === 0) await this.advance(projectId, stage);            // enqueue next
}
```

---

## 4. Queue Architecture (BullMQ)

### 4.1 Queues — one per stage

| Queue | Concurrency | Rate limit | Retry / backoff | Notes |
|---|---|---|---|---|
| `channel-ingest` | 5 | YT quota-aware | 5×, exp 5s→5m | 1 job/project; scores + selects videos |
| `video-data` | 10 | YT quota-aware | 5×, exp | metadata + comments per video |
| `transcript-fetch` | 8 | gentle (IP-sensitive) | 4×, exp + jitter | proxy rotation; null → fallback |
| `whisper-transcribe` | 2 | GPU-bound | 3×, exp 30s→10m | expensive; lowest concurrency |
| `video-summarize` | 6 | Anthropic tier | 4×, exp | Sonnet — knowledge extraction (Phase 5) |
| `analyze-comments` | 8 | Anthropic tier | 4×, exp | Haiku — audience insights (Phase 6) |
| `knowledge-base` | 4 | Anthropic tier | 4×, exp | Sonnet — reduce; barrier (Phase 7) |
| `book-strategy` | 4 | Anthropic tier | 4×, exp | Sonnet (Phase 8) |
| `outline-generate` | 4 | Anthropic tier | 4×, exp | Sonnet; materializes chapters (Phase 9) |
| `chapter-research` | 5 | Anthropic tier | 4×, exp | Sonnet; fan-out, barrier (Phase 10) |
| `chapter-generate` | 4 | Anthropic tier | 3×, exp 10s→5m | Opus, long output (Phase 11) |
| `polish-book` | 2 | Anthropic tier | 3× | Opus — manuscript pass (Phase 12) |
| `extra-content` | 3 | Anthropic tier | 3× | Opus — bonus chapters (Phase 13); user-triggered |
| `ebook-assemble` | 4 | — | 3× | deterministic (Phase 14) |
| `export` | 3 | Puppeteer mem | 3× | pdf + docx (Phase 15) |

Plus per-queue **`QueueEvents`** listeners for SSE progress, and a shared **dead-letter** convention: after `attemptsMade >= attempts`, the worker records `FAILED` in `job_runs` and emits a `pipeline.stage.failed` event.

### 4.2 Idempotency model (3 layers)

1. **Deterministic `jobId`** → BullMQ dedupes identical in-flight/recent jobs.
   `transcript-fetch` → `jobId = transcript:${projectId}:${videoId}`.
2. **DB state guard** → first thing each use case does is load the target row; if its `status` is already `DONE` *and* the input `hash` matches, it returns early (no AI/network call).
3. **Content hash** → `inputHash = sha256(stableStringify(inputs))`. Stored on the output row. On retry, equal hash ⇒ reuse existing output; differing hash (e.g. user changed outline) ⇒ regenerate.

```typescript
// every processor wraps the use case identically:
const guard = await idempotency.begin(jobKey, inputHash); // job_runs upsert
if (guard.alreadyCompleted) return guard.previousResult;   // safe re-run
const out = await useCase.execute(payload);
await idempotency.complete(jobKey, out.ref);
```

### 4.3 Retry-safety rules (enforced for every worker)

- **No side effect before the guard**: never call Claude/Whisper before checking `alreadyCompleted`.
- **Idempotent writes**: all persistence is `UPSERT ... ON CONFLICT` keyed by the natural key (`project_id, video_id`, etc.), never blind `INSERT`.
- **At-least-once delivery assumption**: workers must tolerate the same job twice; the guard + upsert make the second run a no-op.
- **Partial-progress resumability**: fan-out children are independent jobs; re-running the parent re-enqueues only missing children (those without a `DONE` `job_run`).
- **Poison-message protection**: validation errors (bad DTO, unpar-seable AI output after N parse retries) → moved straight to failed, not retried forever.
- **Graceful shutdown**: `SIGTERM` → `worker.close()` lets the active job finish; BullMQ stalled-job recovery re-queues anything killed mid-flight.

### 4.4 Concurrency & cost controls

- **Anthropic group rate-limiter** shared across all AI queues via BullMQ `limiter` + a Redis token bucket keyed on the API key, so total TPM/RPM stays under tier limits.
- **Chapter fan-out is bounded** (concurrency 4) and each job carries the *cached* channel-summary+outline prefix to cut input tokens.
- **Whisper is gated**: only enqueued for videos where `transcript-fetch` returned `null`; concurrency 2 to bound GPU/$$.

---

## 5. API Endpoints (Next.js Route Handlers)

All under `/api`. Auth via Supabase session; every handler validates a Zod DTO and resolves a use case from the container. Controllers are thin.

| Method | Path | Use case | Body / returns |
|---|---|---|---|
| `POST` | `/api/projects` | `SubmitChannelUseCase` | `{ channelUrl, options }` → `{ projectId, status }` |
| `GET` | `/api/projects` | list | → paginated projects for user |
| `GET` | `/api/projects/:id` | get | → project + progress aggregate |
| `GET` | `/api/projects/:id/events` | — | **SSE** stream of stage progress |
| `DELETE` | `/api/projects/:id` | cancel | drains queued jobs, marks cancelled |
| `POST` | `/api/projects/:id/retry` | `PipelineOrchestrator.resume` | re-enqueue failed stages |
| `GET` | `/api/projects/:id/book` | get book | → outline + chapters + sections |
| `POST` | `/api/chapters/:id/regenerate` | `RegenerateChapterUseCase` | `{ instructions? }` → new chapter version job |
| `PATCH` | `/api/chapters/:id` | edit | manual content edit (saves version) |
| `POST` | `/api/sections` | `AddSectionUseCase` | `{ chapterId, prompt, position }` → section job |
| `POST` | `/api/exports` | `ExportEbookUseCase` | `{ projectId, format: pdf\|docx\|both }` → `{ jobId }` |
| `GET` | `/api/exports/:id` | get artifact | → signed Storage URL |
| `POST` | `/api/webhooks/stripe` | billing | subscription/credits |

**SSE contract** (`/events`): server subscribes to BullMQ `QueueEvents` filtered by `projectId` and emits `{ stage, status, progress, message }`. The UI renders the pipeline live and unlocks the editor when `status=COMPLETED`.

DTO example:

```typescript
// application/dto/SubmitChannel.dto.ts
export const SubmitChannelDto = z.object({
  channelUrl: z.string().url().refine(isYouTubeChannelUrl, 'Not a YouTube channel URL'),
  options: z.object({
    targetPages: z.number().int().min(50).max(200).default(100),
    maxVideos: z.number().int().min(10).max(50).default(40),
    tone: z.enum(['educational', 'conversational', 'professional']).default('professional'),
    includeComments: z.boolean().default(true),
  }).default({}),
});
export type SubmitChannelDto = z.infer<typeof SubmitChannelDto>;
```

---

## 6. Domain Entities

Framework-free. Constructors are private; entities are created through factory methods that enforce invariants and return `Result`.

### 6.1 Shared base

```typescript
// domain/shared/AggregateRoot.ts
export abstract class AggregateRoot<TProps, TId> {
  protected readonly _id: TId;
  protected props: TProps;
  private _domainEvents: DomainEvent[] = [];
  protected constructor(props: TProps, id: TId) { this.props = props; this._id = id; }
  get id(): TId { return this._id; }
  protected addEvent(e: DomainEvent) { this._domainEvents.push(e); }
  pullEvents(): DomainEvent[] { const e = this._domainEvents; this._domainEvents = []; return e; }
}
```

### 6.2 Project (aggregate root — pipeline owner)

```typescript
// domain/project/Project.ts
export class Project extends AggregateRoot<ProjectProps, ProjectId> {
  static create(p: { ownerId: UserId; channelUrl: ChannelUrl; options: GenerationOptions; id: ProjectId }): Result<Project> {
    return Result.ok(new Project({
      ownerId: p.ownerId, channelUrl: p.channelUrl, options: p.options,
      status: ProjectStatus.created(), version: 0, createdAt: /* clock */,
    }, p.id));
  }

  // The state machine lives here — illegal transitions return Result.fail
  advanceTo(next: ProjectStatus): Result<void> {
    if (!this.props.status.canTransitionTo(next))
      return Result.fail(`Illegal transition ${this.props.status.value} → ${next.value}`);
    const prev = this.props.status;
    this.props.status = next;
    this.addEvent(new ProjectStatusChanged(this.id, prev.value, next.value));
    return Result.ok();
  }

  markFailed(reason: string): Result<void> { /* → FAILED, emit event */ }
  get status() { return this.props.status; }
}
```

```typescript
// domain/project/ProjectStatus.ts (VO with explicit transition table — full 15-phase contract)
const TRANSITIONS: Record<ProjectState, ProjectState[]> = {
  CREATED: ['INGESTING_CHANNEL', 'FAILED'],
  INGESTING_CHANNEL: ['FETCHING_VIDEO_DATA', 'FAILED'],
  FETCHING_VIDEO_DATA: ['FETCHING_TRANSCRIPTS', 'FAILED'],
  FETCHING_TRANSCRIPTS: ['TRANSCRIBING_FALLBACK', 'SUMMARIZING_VIDEOS', 'FAILED'],
  TRANSCRIBING_FALLBACK: ['SUMMARIZING_VIDEOS', 'FAILED'],
  SUMMARIZING_VIDEOS: ['ANALYZING_COMMENTS', 'PARTIAL', 'FAILED'],
  ANALYZING_COMMENTS: ['BUILDING_KNOWLEDGE_BASE', 'FAILED'],
  BUILDING_KNOWLEDGE_BASE: ['GENERATING_BOOK_STRATEGY', 'FAILED'],
  GENERATING_BOOK_STRATEGY: ['GENERATING_OUTLINE', 'FAILED'],
  GENERATING_OUTLINE: ['GENERATING_CHAPTER_RESEARCH', 'FAILED'],
  GENERATING_CHAPTER_RESEARCH: ['GENERATING_CHAPTERS', 'FAILED'],
  GENERATING_CHAPTERS: ['POLISHING_BOOK', 'FAILED'],
  POLISHING_BOOK: ['ASSEMBLING', 'FAILED'],
  ASSEMBLING: ['EXPORTING', 'FAILED'],
  EXPORTING: ['COMPLETED', 'FAILED'],
  COMPLETED: [], FAILED: [], PARTIAL: ['ANALYZING_COMMENTS', 'FAILED'],
};
// Retry uses Project.resumeAt(stage) to rewind a FAILED project to a prior stage,
// bypassing this table (the only sanctioned exception).
```

### 6.3 Video (aggregate root)

```typescript
// domain/video/Video.ts
export class Video extends AggregateRoot<VideoProps, VideoId> {
  attachTranscript(t: Transcript): Result<void> {
    if (this.props.transcript?.source === TranscriptSource.YOUTUBE && t.source === TranscriptSource.WHISPER)
      return Result.fail('Refusing to overwrite captions with Whisper output'); // invariant
    this.props.transcript = t; return Result.ok();
  }
  needsWhisperFallback(): boolean { return !this.props.transcript && this.props.hasAudio; }
  attachSummary(s: VideoSummary): Result<void> {
    if (!this.props.transcript) return Result.fail('Cannot summarize without transcript');
    this.props.summary = s; return Result.ok();
  }
}
```

### 6.4 Book / Chapter / Section (aggregate)

```typescript
// domain/book/Book.ts — invariant: total page budget ≈ targetPages
export class Book extends AggregateRoot<BookProps, BookId> {
  setOutline(o: Outline): Result<void> { /* assigns chapter page budgets via PageBudget */ }
  addChapter(c: Chapter): Result<void> { /* enforce unique position */ }

  regenerateChapter(chapterId: ChapterId, content: ChapterContent): Result<void> {
    const ch = this.props.chapters.find(c => c.id.equals(chapterId));
    if (!ch) return Result.fail('Chapter not found');
    ch.replaceContent(content);                 // bumps chapter.version, keeps history
    this.addEvent(new ChapterGenerated(this.id, chapterId, ch.version));
    return Result.ok();
  }

  insertSection(chapterId: ChapterId, section: Section, position: number): Result<void> {
    // post-generation editing: shift positions, re-evaluate page budget
  }

  get estimatedPages(): number { return Math.ceil(this.totalWords() / PageBudget.WORDS_PER_PAGE); }
}
```

```typescript
// domain/book/PageBudget.ts — turns "100 pages" into word targets
export class PageBudget extends ValueObject<{ pages: number }> {
  static readonly WORDS_PER_PAGE = 450;
  totalWords() { return this.props.pages * PageBudget.WORDS_PER_PAGE; }
  // ~100 pages → ~45,000 words → ~12 chapters × ~3,750 words each
  perChapterWords(chapterCount: number) { return Math.round(this.totalWords() / chapterCount); }
}
```

**Aggregate boundaries:** `Project`, `Video`, and `Book` are separate aggregate roots referenced by id (not nested object graphs), so each can be loaded/saved independently — essential for fan-out workers writing different videos concurrently without contention.

---

## 7. Use Cases (Application Layer)

Each use case: validate input → load aggregate(s) via repo → call domain methods + ports → persist via UnitOfWork → enqueue next stage. They never touch HTTP, SQL, or SDKs directly.

### 7.1 Representative full implementation — Fetch Transcript (with Whisper fallback decision)

```typescript
// application/use-cases/FetchTranscriptUseCase.ts
export class FetchTranscriptUseCase {
  constructor(
    private readonly videos: VideoRepository,
    private readonly transcripts: TranscriptProvider,
    private readonly storage: ObjectStorage,
    private readonly audio: AudioDownloader,
    private readonly queue: JobQueue,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(cmd: { projectId: string; videoId: string }): Promise<Result<FetchTranscriptResult>> {
    const video = await this.videos.findById(VideoId.from(cmd.videoId));
    if (!video) return Result.fail('Video not found');
    if (video.hasTranscript()) return Result.ok({ source: video.transcriptSource, skipped: true }); // idempotent

    const fetched = await this.transcripts.fetch(video.id);
    if (fetched.isFail()) return Result.fail(fetched.error);

    if (fetched.value) {                                   // captions exist → use them
      video.attachTranscript(Transcript.fromYouTube(fetched.value, this.clock.now()));
      await this.uow.run(async () => this.videos.save(video));
      return Result.ok({ source: 'youtube', skipped: false });
    }

    // No captions → download audio to Storage, enqueue Whisper (do NOT transcribe inline)
    const audioRef = await this.audio.downloadTo(video.youtubeId, this.storage);
    video.markAwaitingTranscription(audioRef);
    await this.uow.run(async () => this.videos.save(video));
    await this.queue.enqueue('whisper-transcribe', {
      projectId: cmd.projectId, videoId: cmd.videoId, audioRef: audioRef.value,
    }, { jobId: `whisper:${cmd.projectId}:${cmd.videoId}` });   // deterministic → dedup
    return Result.ok({ source: 'pending-whisper', skipped: false });
  }
}
```

### 7.2 Representative — Generate Chapter (map step, Opus + prompt cache)

```typescript
// application/use-cases/GenerateChapterUseCase.ts
export class GenerateChapterUseCase {
  constructor(
    private books: BookRepository, private projects: ProjectRepository,
    private ai: AiTextGenerator, private parser: ChapterParser,
    private uow: UnitOfWork, private orchestrator: PipelineOrchestrator,
  ) {}

  async execute(cmd: { projectId: string; chapterId: string; inputHash: string }): Promise<Result<void>> {
    const book = await this.books.findByProject(ProjectId.from(cmd.projectId));
    const chapter = book.chapter(ChapterId.from(cmd.chapterId));
    if (chapter.isGeneratedFor(cmd.inputHash)) return Result.ok();  // idempotent guard

    const ctx = await this.books.loadSharedContext(book.id); // channel summary + outline (cached prefix)
    const completion = await this.ai.generate({
      model: 'claude-opus-4-8',
      system: ChapterPrompts.system(ctx.tone),
      messages: ChapterPrompts.user(ctx.channelSummary, ctx.outline, chapter.topic, chapter.wordTarget),
      maxTokens: 8000,
      cacheControl: { systemPrefix: true },           // reuse shared context across chapters
      metadata: { projectId: cmd.projectId, stage: 'chapter-generate' },
    });
    if (completion.isFail()) return Result.fail(completion.error);

    const content = this.parser.parse(completion.value.text);  // validated, structured
    if (content.isFail()) return Result.fail(content.error);    // → poison handling

    book.regenerateChapter(chapter.id, content.value);
    await this.uow.run(async () => this.books.save(book));
    await this.orchestrator.onStageItemCompleted(cmd.projectId, 'GENERATING_CHAPTERS'); // fan-in
    return Result.ok();
  }
}
```

### 7.3 All use cases at a glance

| Use case | Trigger | Reads | Writes | Enqueues next |
|---|---|---|---|---|
| `SubmitChannel` | HTTP POST | — | project(CREATED) | `channel-ingest` |
| `IngestChannel` | worker | channel API | channel + N video stubs (scored/selected) | N× `video-data` |
| `FetchVideoData` | worker | YT Data API | video meta + comments | `transcript-fetch` |
| `FetchTranscript` | worker | Transcript API | transcript or audioRef | `whisper-transcribe`? → `video-summarize` |
| `TranscribeAudio` | worker | Whisper | transcript(whisper) | `video-summarize` |
| `SummarizeVideo` | worker | transcript | video knowledge (10-field) | `analyze-comments` |
| `AnalyzeComments` | worker | comments | comment insights | (per-video barrier) |
| `BuildKnowledgeBase` | worker (barrier) | all video knowledge + insights | channel knowledge base | `book-strategy` |
| `GenerateBookStrategy` | worker | knowledge base | book strategy | `outline-generate` |
| `GenerateOutline` | worker | strategy + KB | outline + chapter stubs | N× `chapter-research` (sets barrier) |
| `GenerateChapterResearch` | worker | outline + videos/KB | per-chapter research | (barrier) → `StartChapterGeneration` |
| `StartChapterGeneration` | worker (barrier) | book | sets chapter barrier | N× `chapter-generate` |
| `GenerateChapter` | worker | shared ctx + research | chapter content | (fan-in) → `polish-book` |
| `PolishBook` | worker (barrier) | all chapters | polished chapters | `ebook-assemble` |
| `AssembleEbook` | worker | book + matter | assembled doc model | `export` |
| `ExportEbook` | worker / HTTP | assembled doc | pdf+docx artifacts | — |
| `RegenerateChapter` | HTTP POST | book + ctx | new chapter version | `chapter-generate` (regenerate mode) |
| `EditChapter` | HTTP PATCH | book | edited chapter + version snapshot | — (synchronous, no AI) |
| `AddSection` | HTTP POST | chapter + ctx | new section (synchronous Opus) | — |
| `AddExtraContent` / `GenerateExtraContent` | HTTP POST / worker | book + ctx | front/back matter | `extra-content` (bonus chapters) |

---

## 8. Sequence Diagrams

### 8.1 Submit → full generation (happy path)

```
User    Web/API        Queue(BullMQ)         Worker/UseCase         Supabase     Claude/YT/Whisper
 │  POST /projects │                          │                       │              │
 ├───────────────►│ SubmitChannel             │                       │              │
 │                │ save project(CREATED)──────────────────────────►  │              │
 │                │ enqueue channel-ingest ───►│                       │              │
 │◄── 202 {id} ───┤                            │                       │              │
 │                │                            ├─ IngestChannel ──────────────────────► YT Data (channel+videos)
 │                │                            │  save channel + 40 video stubs ─────► │
 │                │                            │  enqueue 40× video-data ─►│           │
 │                │           (fan-out 40) ────►│ FetchVideoData ──────────────────────► YT Data (meta+comments)
 │                │                            │  upsert video+comments ─────────────► │
 │                │                            │  enqueue transcript-fetch ►│          │
 │                │                            ├─ FetchTranscript ────────────────────► Transcript API
 │                │                            │   caption? yes→save  / no→download audio►Storage, enqueue whisper
 │                │                            ├─ TranscribeAudio (fallback) ─────────► Whisper
 │                │                            │   save transcript(whisper) ─────────► │
 │                │        (fan-in barrier)    ├─ SummarizeVideo ×N ──────────────────► Claude(Sonnet)
 │                │   pending_count→0 triggers ├─ SummarizeChannel ───────────────────► Claude(Sonnet)
 │                │                            ├─ GenerateOutline ────────────────────► Claude(Sonnet)
 │                │                            ├─ GenerateChapterTopics ──────────────► Claude(Sonnet)
 │                │        (fan-out ~12)       ├─ GenerateChapter ×12 ────────────────► Claude(Opus, cached ctx)
 │                │        (fan-in barrier)    ├─ AssembleEbook                        │
 │                │                            ├─ ExportEbook ── pdf+docx ───────────► Storage
 │◄ SSE COMPLETED ┤◄── QueueEvents ────────────┤  project→COMPLETED ─────────────────► │
 │  GET /exports  │  signed URL                │                       │              │
```

### 8.2 Transcript fetch with Whisper fallback (decision)

```
FetchTranscriptUseCase
   │ video.hasTranscript()? ──yes──► return {skipped:true}        (idempotent)
   │ no
   ├─ TranscriptProvider.fetch(videoId)
   │     ├─ Result.ok(transcript)  ──► attachTranscript(youtube) ► save ► done
   │     ├─ Result.ok(null)        ──► AudioDownloader→Storage ► enqueue whisper-transcribe(jobId deterministic)
   │     └─ Result.fail(err)       ──► throw → BullMQ retry (backoff+jitter)
```

### 8.3 Chapter regeneration (post-generation edit)

```
User ─ POST /chapters/:id/regenerate {instructions}
  └► RegenerateChapterUseCase
       ├─ load Book, compute new inputHash = sha256(topic+instructions+ctxVersion)
       ├─ book.chapter.markRegenerating(); save version snapshot
       └─ enqueue chapter-generate {chapterId, inputHash, mode:'regenerate', instructions}
            └► GenerateChapterUseCase (same processor, new hash ⇒ not skipped)
                 └─ Claude(Opus) ► parse ► book.regenerateChapter() ► save ► SSE update
```

### 8.4 Idempotent retry of any worker

```
Worker picks job (possibly a duplicate / 2nd attempt)
  ├─ idempotency.begin(jobKey, inputHash)
  │     ├─ job_runs row COMPLETED & same hash ─► return cached result, ACK (no side effects)
  │     └─ else mark RUNNING(attempt++)
  ├─ useCase.execute()   ── all writes are UPSERT ON CONFLICT
  ├─ success ─► idempotency.complete(jobKey, ref) ─► ACK
  └─ throw   ─► attempt<max ? BullMQ requeue(backoff) : job_runs FAILED + emit stage.failed
```

---

## 9. Supabase Table Definitions (SQL DDL)

> **Migrations:** `0001_init.sql` creates the base schema below. The 15-phase
> pipeline is layered on by `0002_full_pipeline.sql` (new `project_status` values
> + `comment_insights`, `channel_knowledge_bases`, `book_strategies`,
> `chapter_research` tables), `0003_extra_content.sql` (`book_sections`), and
> `0004_video_knowledge.sql` (full `VideoKnowledge` blob). The enum snippet here
> shows the **initial** values; the live enum also contains `ANALYZING_COMMENTS`,
> `BUILDING_KNOWLEDGE_BASE`, `GENERATING_BOOK_STRATEGY`,
> `GENERATING_CHAPTER_RESEARCH`, and `POLISHING_BOOK`.

```sql
-- ── enums ──────────────────────────────────────────────────────────────────
create type project_status as enum (
  'CREATED','INGESTING_CHANNEL','FETCHING_VIDEO_DATA','FETCHING_TRANSCRIPTS',
  'TRANSCRIBING_FALLBACK','SUMMARIZING_VIDEOS','SUMMARIZING_CHANNEL',
  'GENERATING_OUTLINE','GENERATING_TOPICS','GENERATING_CHAPTERS',
  'ASSEMBLING','EXPORTING','COMPLETED','PARTIAL','FAILED'
);
create type transcript_source as enum ('youtube','whisper');
create type job_state as enum ('PENDING','RUNNING','COMPLETED','FAILED');
create type content_status as enum ('PENDING','GENERATING','DONE','FAILED');
create type export_format as enum ('pdf','docx');

-- ── projects (pipeline root) ───────────────────────────────────────────────
create table projects (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  channel_url   text not null,
  status        project_status not null default 'CREATED',
  options       jsonb not null default '{}',          -- targetPages, tone, maxVideos...
  pending_counts jsonb not null default '{}',          -- {"GENERATING_CHAPTERS": 12} fan-in barrier
  version       int not null default 0,                -- optimistic concurrency
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── channel snapshot ───────────────────────────────────────────────────────
create table channels (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null unique references projects(id) on delete cascade,
  youtube_id     text not null,
  title          text not null,
  description    text,
  subscriber_count bigint,
  video_count    int,
  thumbnail_url  text,
  raw            jsonb,
  created_at     timestamptz not null default now()
);

-- ── videos ─────────────────────────────────────────────────────────────────
create table videos (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  youtube_id     text not null,
  title          text not null,
  description    text,
  published_at   timestamptz,
  duration_s     int,
  view_count     bigint,
  position       int not null,                          -- ordering by relevance/recency
  has_audio      boolean not null default true,
  status         content_status not null default 'PENDING',
  created_at     timestamptz not null default now(),
  unique (project_id, youtube_id)                        -- idempotent upsert key
);

-- ── transcripts (1:1 video) ────────────────────────────────────────────────
create table transcripts (
  id           uuid primary key default gen_random_uuid(),
  video_id     uuid not null unique references videos(id) on delete cascade,
  source       transcript_source not null,
  language     text,
  text         text not null,
  segments     jsonb,                                    -- [{start,dur,text}]
  audio_ref    text,                                     -- storage path when whisper used
  input_hash   text not null,
  created_at   timestamptz not null default now()
);

-- ── comments (top N per video) ─────────────────────────────────────────────
create table comments (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid not null references videos(id) on delete cascade,
  youtube_id    text not null,
  author        text,
  text          text not null,
  like_count    int default 0,
  published_at  timestamptz,
  unique (video_id, youtube_id)
);

-- ── per-video summaries ────────────────────────────────────────────────────
create table video_summaries (
  id           uuid primary key default gen_random_uuid(),
  video_id     uuid not null unique references videos(id) on delete cascade,
  summary      text not null,
  key_points   jsonb,                                    -- string[]
  themes       jsonb,
  model        text not null,
  input_hash   text not null,
  created_at   timestamptz not null default now()
);

-- ── channel summary (reduce) ───────────────────────────────────────────────
create table channel_summaries (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null unique references projects(id) on delete cascade,
  summary      text not null,
  topics       jsonb,
  audience     text,
  tone         text,
  input_hash   text not null,
  created_at   timestamptz not null default now()
);

-- ── book + outline + chapters + sections ───────────────────────────────────
create table books (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null unique references projects(id) on delete cascade,
  title        text,
  target_pages int not null default 100,
  status       content_status not null default 'PENDING',
  created_at   timestamptz not null default now()
);

create table outlines (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references books(id) on delete cascade,
  version      int not null default 1,
  structure    jsonb not null,                           -- [{title, summary, wordTarget}]
  input_hash   text not null,
  created_at   timestamptz not null default now(),
  unique (book_id, version)
);

create table chapters (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references books(id) on delete cascade,
  position     int not null,
  title        text not null,
  topic        text not null,
  word_target  int not null,
  content      text,                                     -- markdown
  word_count   int default 0,
  status       content_status not null default 'PENDING',
  version      int not null default 1,
  input_hash   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (book_id, position)
);

create table chapter_versions (                          -- history for regeneration/undo
  id           uuid primary key default gen_random_uuid(),
  chapter_id   uuid not null references chapters(id) on delete cascade,
  version      int not null,
  content      text not null,
  created_at   timestamptz not null default now(),
  unique (chapter_id, version)
);

create table sections (                                  -- added after generation
  id           uuid primary key default gen_random_uuid(),
  chapter_id   uuid not null references chapters(id) on delete cascade,
  position     int not null,
  title        text not null,
  prompt       text,
  content      text,
  status       content_status not null default 'PENDING',
  created_at   timestamptz not null default now(),
  unique (chapter_id, position)
);

-- ── exports ────────────────────────────────────────────────────────────────
create table export_artifacts (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  format       export_format not null,
  storage_path text not null,
  byte_size    bigint,
  page_count   int,
  book_version int not null default 1,
  created_at   timestamptz not null default now()
);

-- ── job ledger (idempotency + audit) ───────────────────────────────────────
create table job_runs (
  job_key      text primary key,                         -- e.g. transcript:proj:video
  project_id   uuid not null references projects(id) on delete cascade,
  queue        text not null,
  state        job_state not null default 'PENDING',
  attempt      int not null default 0,
  input_hash   text,
  result_ref   text,
  error        text,
  updated_at   timestamptz not null default now()
);

-- ── indexes ────────────────────────────────────────────────────────────────
create index on videos (project_id);
create index on comments (video_id);
create index on chapters (book_id, position);
create index on job_runs (project_id, queue, state);

-- ── atomic fan-in barrier (decrement returns remaining) ────────────────────
create or replace function decrement_pending(p_project uuid, p_stage text)
returns int language sql as $$
  update projects
     set pending_counts = jsonb_set(
           pending_counts, array[p_stage],
           to_jsonb(greatest((pending_counts->>p_stage)::int - 1, 0))),
         updated_at = now()
   where id = p_project
  returning (pending_counts->>p_stage)::int;
$$;

-- ── RLS (multi-tenant) ─────────────────────────────────────────────────────
alter table projects enable row level security;
create policy "own projects" on projects
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- child tables: policy via EXISTS join to a project owned by auth.uid()
-- workers use the service-role key and bypass RLS.
```

**Storage buckets:** `audio/` (private, lifecycle-deleted after transcription), `exports/` (private, served via signed URLs).

---

## 10. BullMQ Worker Design

### 10.1 Connection, queues, and the generic worker factory

```typescript
// infrastructure/queue/connection.ts
export const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

// infrastructure/queue/queues.ts
export const QUEUE = {
  channelIngest: 'channel-ingest', videoData: 'video-data',
  transcriptFetch: 'transcript-fetch', whisper: 'whisper-transcribe',
  videoSummarize: 'video-summarize', channelSummarize: 'channel-summarize',
  outline: 'outline-generate', chapterTopics: 'chapter-topics',
  chapterGenerate: 'chapter-generate', assemble: 'ebook-assemble', export: 'export',
} as const;
```

```typescript
// workers/runtime/worker-factory.ts — uniform idempotency + retry wrapper
export function makeWorker<TPayload>(opts: {
  name: string; concurrency: number; limiter?: { max: number; duration: number };
  payloadSchema: z.ZodType<TPayload>;
  handler: (p: TPayload, ctx: WorkerCtx) => Promise<unknown>;
}): Worker {
  return new Worker(opts.name, async (job) => {
    const payload = opts.payloadSchema.parse(job.data);        // DTO validation (poison guard)
    const jobKey  = job.opts.jobId!;
    const inputHash = (payload as any).inputHash ?? stableHash(payload);

    const guard = await container.idempotency.begin(jobKey, opts.name, inputHash, job.attemptsMade);
    if (guard.alreadyCompleted) return guard.result;           // safe no-op re-run

    try {
      const result = await opts.handler(payload, { container, job });
      await container.idempotency.complete(jobKey, result);
      return result;
    } catch (err) {
      if (err instanceof NonRetryableError || job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await container.idempotency.fail(jobKey, String(err));
        container.events.emit('pipeline.stage.failed', { jobKey, name: opts.name });
      }
      throw err;                                                // let BullMQ apply backoff/retry
    }
  }, {
    connection, concurrency: opts.concurrency, limiter: opts.limiter,
    settings: { backoffStrategy: (n) => Math.min(5000 * 2 ** n, 300_000) + jitter() },
  });
}
```

### 10.2 A concrete processor (transcript-fetch)

```typescript
// workers/processors/transcript-fetch.processor.ts
export const transcriptFetchWorker = makeWorker({
  name: QUEUE.transcriptFetch,
  concurrency: 8,
  payloadSchema: z.object({ projectId: z.string().uuid(), videoId: z.string().uuid(), inputHash: z.string().optional() }),
  handler: async (p) => {
    const useCase = container.resolve('fetchTranscriptUseCase');
    const res = await useCase.execute(p);
    if (res.isFail()) throw new Error(res.error);     // retryable network/parse failures
    // fan-in only counts videos that DON'T need whisper; whisper completion counts later
    if (res.value.source !== 'pending-whisper')
      await container.orchestrator.onStageItemCompleted(p.projectId, 'FETCHING_TRANSCRIPTS');
    return res.value;
  },
});
```

### 10.3 Enqueue defaults (per stage, deterministic jobId)

```typescript
await queue.add(QUEUE.chapterGenerate, payload, {
  jobId: `chapter:${projectId}:${chapterId}:${inputHash}`,  // dedup + regeneration distinct
  attempts: 3,
  backoff: { type: 'custom' },           // exp + jitter via settings.backoffStrategy
  removeOnComplete: { age: 86_400 },     // keep 1 day for SSE/debug
  removeOnFail: false,                   // inspect failures
});
```

### 10.4 Boot, scaling & graceful shutdown

```typescript
// workers/index.ts
const workers = [
  channelIngestWorker, videoDataWorker, transcriptFetchWorker, whisperWorker,
  videoSummarizeWorker, channelSummarizeWorker, outlineWorker, chapterTopicsWorker,
  chapterGenerateWorker, assembleWorker, exportWorker,
];
const events = new QueueEvents(QUEUE.chapterGenerate, { connection }); // → SSE bridge

async function shutdown() {                       // SIGTERM: finish active jobs, then exit
  await Promise.all(workers.map(w => w.close())); // stalled jobs auto-recovered by BullMQ
  await connection.quit();
  process.exit(0);
}
process.on('SIGTERM', shutdown).on('SIGINT', shutdown);
```

- **Scaling:** AI queues (`video-summarize`, `chapter-generate`) and `whisper` scale to dedicated pods; YouTube/transcript queues stay low-concurrency to respect quotas/IP limits. A shared Redis **token bucket** caps total Anthropic TPM across all AI workers regardless of pod count.
- **Stalled-job recovery:** BullMQ's lock renewal + `stalledInterval` re-queues jobs from crashed workers; combined with the idempotency guard this gives safe at-least-once execution.
- **Dead-letter:** `removeOnFail:false` keeps exhausted jobs; a `/api/projects/:id/retry` endpoint re-enqueues only stages whose `job_runs.state = FAILED`.

---

## 11. Cross-Cutting Concerns

- **DI / composition root** (`packages/config/container.ts`): registers every adapter against its port; the web app resolves a request-scoped container, workers a process-scoped one. Swap `ClaudeTextGenerator` for a fake in tests with one line.
- **Strong typing & validation:** Zod at all three boundaries — HTTP DTOs, queue payloads, and **Claude output** (parsed into typed structures with bounded parse-retries before becoming a poison message). `Result<T,E>` removes throwing from the domain.
- **Testability:** domain entities are pure (unit tests, no mocks); use cases test against in-memory repository fakes + stub ports; integration tests run real Supabase (test project) + a fake AI; e2e drives the API + an embedded Redis.
- **Observability:** Pino structured logs keyed by `projectId`/`jobKey`; every AI call records model, tokens, cost into `job_runs`/a `usage` table for billing; SSE surfaces stage progress to the UI.
- **Security/multi-tenancy:** Supabase RLS scopes all reads to `auth.uid()`; workers use the service-role key; signed URLs for exports; secrets via env validated by `config/env.ts`.
- **Cost discipline (no vector DB):** map-reduce summarization keeps context bounded; prompt caching reuses the channel-summary+outline prefix across ~12 chapter generations; model tiering (Haiku/Sonnet/Opus) matches spend to task value.

---

### Build order (suggested)
1. `core/domain` + `core/application/ports` (pure, fully unit-tested).
2. Supabase migrations + repositories + UnitOfWork.
3. BullMQ infra (`worker-factory`, idempotency, orchestrator).
4. Adapters: YouTube → Transcript → Whisper → Claude → exporters.
5. Use cases wired through the container.
6. Next.js API + SSE + editor UI.
7. Hardening: rate limiters, retry/DLQ, billing, RLS audit.
