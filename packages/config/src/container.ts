import {
  PipelineOrchestrator,
  SubmitChannelUseCase,
  StartQueuedProjectsUseCase,
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
  EditBookSectionUseCase,
  AddSectionUseCase,
  AddExtraContentUseCase,
  GenerateExtraContentUseCase,
  GenerateFrontBackMatterUseCase,
  GenerateCoverImageUseCase,
  GenerateIllustrationsUseCase,
  GenerateLandingPageUseCase,
  PublishLandingPageUseCase,
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
  Labs69ImageGenerator,
  FallbackImageGenerator,
  SharpImageProcessor,
  SharpColorSampler,
  NetlifyDeployer,
  LandingPageHtmlRenderer,
  GeneratedPageAssembler,
  HttpReferencePageFetcher,
  HttpImageFetcher,
  PuppeteerReferenceScreenshotter,
  HttpWebFontFetcher,
  labs69ProxyRotator,
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
  SupabaseLandingPageRepository,
  SupabaseLandingLayoutRepository,
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
  // OpenAI gpt-image-1 powers the COVER art.
  const images = OpenAIImageGenerator.fromApiKey(env.OPENAI_API_KEY ?? '');
  // 69labs (img-flux) powers the in-chapter ILLUSTRATIONS — cheap and fast — but
  // its jobs fail intermittently, so OpenAI gpt-image-1 is a reliable fallback:
  // FallbackImageGenerator only pays for OpenAI when a 69labs job fails.
  // 69labs blocks datacenter IPs, so route its requests through residential
  // proxies (LABS69_PROXIES, else the shared YT_DLP_PROXIES pool).
  const labs69 = Labs69ImageGenerator.fromApiKey(
    env.LABS69_API_KEY ?? '',
    env.LABS69_IMAGE_MODEL,
    logger.child({ adapter: '69labs' }),
    labs69ProxyRotator(),
  );
  const illustrationImages = new FallbackImageGenerator(labs69, images, logger.child({ adapter: 'image-fallback' }));
  // Downscales generated illustrations to a print-appropriate JPEG before storage.
  const imageProcessor = new SharpImageProcessor();
  // The landing page takes its whole colour scheme from the book's cover art.
  const colorSampler = new SharpColorSampler();
  const landingRenderer = new LandingPageHtmlRenderer();
  // Assembles a model-generated layout into the finished document.
  const landingAssembler = new GeneratedPageAssembler();
  // Reads the reference sales page a book's layout should follow.
  const referencePages = new HttpReferencePageFetcher();
  // Pulls the YouTube channel avatar in as the landing page's brand mark.
  const imageFetcher = new HttpImageFetcher();
  // Screenshots the reference so the layout model can see how it looks, not
  // just how it is structured.
  const referenceShots = new PuppeteerReferenceScreenshotter();
  // Inlines the reference's real typefaces when their licence allows it.
  const webFonts = new HttpWebFontFetcher();
  const sitePublisher = new NetlifyDeployer(env.NETLIFY_AUTH_TOKEN ?? '', env.NETLIFY_ACCOUNT_SLUG);
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
  const landingPages = new SupabaseLandingPageRepository(supabase);
  // Layouts are captured once per reference template and reused by every book
  // that follows it — see SupabaseLandingLayoutRepository.
  const landingLayouts = new SupabaseLandingLayoutRepository(supabase);
  const idempotency = new SupabaseIdempotencyStore(supabase);

  // ── orchestration ──
  // The admission controller is built first: the orchestrator hands it a freed
  // slot whenever a project completes.
  const startQueuedProjects = new StartQueuedProjectsUseCase(projects, queue, env.MAX_ACTIVE_PROJECTS_PER_USER);
  const orchestrator = new PipelineOrchestrator(projects, queue, clock, logger, startQueuedProjects);

  // ── use cases ──
  const useCases = {
    submitChannel: new SubmitChannelUseCase(projects, queue, ids, clock, env.MAX_ACTIVE_PROJECTS_PER_USER),
    startQueuedProjects,
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
    generateIllustrations: new GenerateIllustrationsUseCase(books, projects, illustrationImages, imageProcessor, storage, ids, logger.child({ useCase: 'illustrations' })),
    assembleEbook: new AssembleEbookUseCase(books, knowledge, clock, storage, projects),
    exportEbook: new ExportEbookUseCase(exporters, storage, artifacts),
    regenerateChapter: new RegenerateChapterUseCase(books, queue, hasher),
    editChapter: new EditChapterUseCase(books),
    editBookSection: new EditBookSectionUseCase(books),
    addSection: new AddSectionUseCase(books, ai, ids),
    addExtraContent: new AddExtraContentUseCase(books, ai, queue, ids),
    generateExtraContent: new GenerateExtraContentUseCase(books, ai),
    generateLandingPage: new GenerateLandingPageUseCase(
      projects,
      books,
      knowledge,
      channels,
      artifacts,
      landingPages,
      landingLayouts,
      ai,
      landingRenderer,
      landingAssembler,
      referencePages,
      referenceShots,
      webFonts,
      colorSampler,
      imageFetcher,
      imageProcessor,
      storage,
      ids,
      clock,
      hasher,
    ),
    publishLandingPage: new PublishLandingPageUseCase(projects, books, landingPages, sitePublisher, clock),
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
    sitePublisher,
    repositories: { projects, videos, channels, books, knowledge, artifacts, landingPages, landingLayouts },
    useCases,
  };
}

export type Container = ReturnType<typeof buildContainer>;

let singleton: Container | null = null;
export function getContainer(): Container {
  if (!singleton) singleton = buildContainer();
  return singleton;
}
