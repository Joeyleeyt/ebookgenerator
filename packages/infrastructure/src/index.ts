// ── Utilities ───────────────────────────────────────────────────────────────
export * from './util/SystemClock.js';
export * from './util/UuidGenerator.js';
export * from './util/Sha256Hasher.js';
export * from './observability/PinoLogger.js';
export * from './observability/PinoTelemetry.js';

// ── AI (Anthropic Claude — text; OpenAI — cover; 69labs — illustrations) ────
export * from './ai/anthropic/ClaudeTextGenerator.js';
export * from './ai/openai/OpenAIImageGenerator.js';
export * from './ai/labs69/Labs69ImageGenerator.js';
export * from './ai/FallbackImageGenerator.js';

// ── Image processing (sharp) ────────────────────────────────────────────────
export * from './image/SharpImageProcessor.js';
export * from './image/SharpColorSampler.js';

// ── Networking (proxy rotation, static hosting) ─────────────────────────────
export * from './net/ProxyRotator.js';
export * from './net/NetlifyDeployer.js';

// ── Landing page (sales page renderer) ──────────────────────────────────────
export * from './landing/LandingPageHtmlRenderer.js';

// ── YouTube ─────────────────────────────────────────────────────────────────
export * from './youtube/YouTubeDataApiProvider.js';
export * from './youtube/YouTubeTranscriptProvider.js';

// ── Whisper fallback ────────────────────────────────────────────────────────
export * from './whisper/WhisperSpeechToText.js';
export * from './whisper/YtDlpAudioDownloader.js';

// ── Storage ─────────────────────────────────────────────────────────────────
export * from './storage/SupabaseStorageAdapter.js';

// ── Export (PDF / DOCX) ─────────────────────────────────────────────────────
export * from './export/PuppeteerPdfExporter.js';
export * from './export/DocxExporter.js';
export * from './export/cookbookHtml.js';

// ── Queue (BullMQ) ──────────────────────────────────────────────────────────
export * from './queue/connection.js';
export * from './queue/queues.js';
export * from './queue/BullJobQueue.js';

// ── Persistence (Supabase) ──────────────────────────────────────────────────
export * from './persistence/supabase/SupabaseClientFactory.js';
export * from './persistence/supabase/SupabaseProjectRepository.js';
export * from './persistence/supabase/SupabaseVideoRepository.js';
export * from './persistence/supabase/SupabaseChannelRepository.js';
export * from './persistence/supabase/SupabaseBookRepository.js';
export * from './persistence/supabase/SupabaseKnowledgeRepository.js';
export * from './persistence/supabase/SupabaseExportArtifactRepository.js';
export * from './persistence/supabase/SupabaseLandingPageRepository.js';
export * from './persistence/supabase/SupabaseUnitOfWork.js';
export * from './persistence/supabase/SupabaseIdempotencyStore.js';
