import {
  PipelineOrchestrator,
  SubmitChannelUseCase,
  IngestChannelUseCase,
  FetchVideoDataUseCase,
  FetchTranscriptUseCase,
  TranscribeAudioUseCase,
  SummarizeVideoUseCase,
  AnalyzeCommentsUseCase,
  BuildKnowledgeBaseUseCase,
  GenerateBookStrategyUseCase,
  GenerateOutlineUseCase,
  GenerateChapterResearchUseCase,
  StartChapterGenerationUseCase,
  GenerateChapterUseCase,
  StartBookPolishUseCase,
  PolishChapterUseCase,
  AssembleEbookUseCase,
  ExportEbookUseCase,
  RegenerateChapterUseCase,
  EditChapterUseCase,
  AddSectionUseCase,
  AddExtraContentUseCase,
  GenerateExtraContentUseCase,
  GenerateFrontBackMatterUseCase,
  GenerateCoverImageUseCase,
  type DocumentExporter,
} from '@yeg/core';
import {
  SystemClock,
  UuidGenerator,
  Sha256Hasher,
  PinoLogger,
  PinoTelemetry,
  ClaudeTextGenerator,
  OpenAIImageGenerator,
  YouTubeDataApiProvider,
  YouTubeTranscriptProvider,
  WhisperSpeechToText,
  YtDlpAudioDownloader,
  SupabaseStorageAdapter,
  PuppeteerPdfExporter,
  DocxExporter,
  getRedisConnection,
  BullJobQueue,
  SupabaseClientFactory,
  SupabaseProjectRepository,
  SupabaseVideoRepository,
  SupabaseChannelRepository,
  SupabaseBookRepository,
  SupabaseKnowledgeRepository,
  SupabaseExportArtifactRepository,
  SupabaseIdempotencyStore,
} from '@yeg/infrastructure';
import { loadEnv, type Env } from './env.js';

/**
 * Composition root. Constructs every adapter behind its port and assembles the
 * use cases. This is the ONLY place infrastructure is bound to abstractions —
 * swapping an adapter (e.g. Whisper → faster-whisper) is a one-line change here.
 */
export function buildContainer(env: Env = loadEnv()) {
  // ── primitives ──
  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const hasher = new Sha256Hasher();
  const logger = PinoLogger.create(env.LOG_LEVEL);
  const telemetry = new PinoTelemetry(logger.child({ component: 'telemetry' }));

  // ── external clients ──
  const supabase = SupabaseClientFactory.serviceRole(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const redis = getRedisConnection(env.REDIS_URL);

  // ── adapters (implement core ports) ──
  const storage = new SupabaseStorageAdapter(supabase);
  const queue = new BullJobQueue(redis);
  const ai = ClaudeTextGenerator.fromApiKey(env.ANTHROPIC_API_KEY, telemetry);
  const images = OpenAIImageGenerator.fromApiKey(env.OPENAI_API_KEY ?? '');
  const youtube = new YouTubeDataApiProvider(env.YOUTUBE_API_KEY);
  const transcripts = new YouTubeTranscriptProvider();
  const audio = new YtDlpAudioDownloader(storage);
  const stt = WhisperSpeechToText.fromApiKey(env.OPENAI_API_KEY ?? '', storage);
  const exporters: DocumentExporter[] = [new PuppeteerPdfExporter(), new DocxExporter()];

  // ── repositories ──
  const projects = new SupabaseProjectRepository(supabase);
  const videos = new SupabaseVideoRepository(supabase);
  const channels = new SupabaseChannelRepository(supabase);
  const books = new SupabaseBookRepository(supabase);
  const knowledge = new SupabaseKnowledgeRepository(supabase);
  const artifacts = new SupabaseExportArtifactRepository(supabase);
  const idempotency = new SupabaseIdempotencyStore(supabase);

  // ── orchestration ──
  const orchestrator = new PipelineOrchestrator(projects, queue, clock, logger);

  // ── use cases ──
  const useCases = {
    submitChannel: new SubmitChannelUseCase(projects, queue, ids, clock),
    ingestChannel: new IngestChannelUseCase(projects, videos, channels, youtube, queue, ids, clock),
    fetchVideoData: new FetchVideoDataUseCase(videos, youtube, queue),
    fetchTranscript: new FetchTranscriptUseCase(videos, transcripts, audio, queue, hasher),
    transcribeAudio: new TranscribeAudioUseCase(videos, stt, storage, hasher),
    summarizeVideo: new SummarizeVideoUseCase(videos, ai, hasher),
    analyzeComments: new AnalyzeCommentsUseCase(videos, knowledge, ai, hasher),
    buildKnowledgeBase: new BuildKnowledgeBaseUseCase(channels, knowledge, ai, hasher),
    generateBookStrategy: new GenerateBookStrategyUseCase(projects, knowledge, channels, ai, hasher),
    generateOutline: new GenerateOutlineUseCase(projects, books, knowledge, ai, queue, ids, clock, hasher),
    generateChapterResearch: new GenerateChapterResearchUseCase(books, videos, knowledge, ai),
    startChapterGeneration: new StartChapterGenerationUseCase(projects, books, queue, clock, hasher),
    generateChapter: new GenerateChapterUseCase(books, knowledge, ai, clock),
    startBookPolish: new StartBookPolishUseCase(projects, books, queue),
    polishChapter: new PolishChapterUseCase(books, knowledge, ai, clock),
    generateFrontBackMatter: new GenerateFrontBackMatterUseCase(books, ai, ids),
    generateCoverImage: new GenerateCoverImageUseCase(books, knowledge, images, storage),
    assembleEbook: new AssembleEbookUseCase(books, knowledge, clock, storage),
    exportEbook: new ExportEbookUseCase(exporters, storage, artifacts),
    regenerateChapter: new RegenerateChapterUseCase(books, queue, hasher),
    editChapter: new EditChapterUseCase(books),
    addSection: new AddSectionUseCase(books, ai, ids),
    addExtraContent: new AddExtraContentUseCase(books, ai, queue, ids),
    generateExtraContent: new GenerateExtraContentUseCase(books, ai),
  };

  return {
    env,
    clock,
    ids,
    hasher,
    logger,
    telemetry,
    storage,
    queue,
    idempotency,
    orchestrator,
    repositories: { projects, videos, channels, books, knowledge, artifacts },
    useCases,
  };
}

export type Container = ReturnType<typeof buildContainer>;

let singleton: Container | null = null;
export function getContainer(): Container {
  if (!singleton) singleton = buildContainer();
  return singleton;
}
