import type { Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import { ProjectJob, VideoJob, WhisperJob, ChapterResearchJob, ChapterJob, PolishChapterJob, ExportJob, ExtraContentJob, ExportFormat, ProjectId } from '@yeg/core';
import type { Container } from '@yeg/config';
import { makeWorker } from '../runtime/worker-factory.js';
import { QUEUE_CONFIG } from '@yeg/infrastructure';

/**
 * Builds every stage worker for the full 15-phase pipeline. Each processor stays
 * thin: validate (schema in the factory) → call the use case → advance the
 * pipeline / report to the convergence barrier.
 */
export function buildWorkers(connection: Redis, container: Container): Worker[] {
  const { useCases, orchestrator } = container;

  const channelIngest = makeWorker(connection, container, {
    name: 'channel-ingest',
    ...QUEUE_CONFIG['channel-ingest'],
    payloadSchema: ProjectJob,
    handler: async (p) => {
      const r = await useCases.ingestChannel.execute(p);
      if (r.isFail()) throw new Error(r.error);
      return r.value;
    },
  });

  const videoData = makeWorker(connection, container, {
    name: 'video-data',
    ...QUEUE_CONFIG['video-data'],
    payloadSchema: VideoJob,
    handler: async (p) => {
      const r = await useCases.fetchVideoData.execute(p);
      if (r.isFail()) throw new Error(r.error);
    },
  });

  const transcriptFetch = makeWorker(connection, container, {
    name: 'transcript-fetch',
    ...QUEUE_CONFIG['transcript-fetch'],
    payloadSchema: VideoJob,
    handler: async (p) => {
      const r = await useCases.fetchTranscript.execute(p);
      if (r.isFail()) throw new Error(r.error);
      // Transcript provenance: captions came straight from the YouTube Data API.
      // ('pending-whisper' is logged by the whisper worker once it transcribes.)
      if (r.value.outcome === 'youtube') {
        container.logger.info('📝 transcript source: YouTube Data API', { projectId: p.projectId, videoId: p.videoId, source: 'youtube-data-api' });
      }
      // Captions found (or already present) → summarize. 'pending-whisper'
      // continues via the whisper worker instead.
      if (r.value.outcome !== 'pending-whisper') {
        await enqueueSummarize(container, p.projectId, p.videoId);
      }
      return r.value;
    },
  });

  const whisper = makeWorker(connection, container, {
    name: 'whisper-transcribe',
    ...QUEUE_CONFIG['whisper-transcribe'],
    payloadSchema: WhisperJob,
    handler: async (p) => {
      const r = await useCases.transcribeAudio.execute(p);
      if (r.isFail()) throw new Error(r.error);
      // Transcript provenance: no captions were available, so this was produced
      // by the Whisper audio-transcription fallback.
      container.logger.info('📝 transcript source: Whisper (audio fallback)', { projectId: p.projectId, videoId: p.videoId, source: 'whisper' });
      await enqueueSummarize(container, p.projectId, p.videoId);
    },
  });

  const videoSummarize = makeWorker(connection, container, {
    name: 'video-summarize',
    ...QUEUE_CONFIG['video-summarize'],
    payloadSchema: VideoJob,
    handler: async (p) => {
      const r = await useCases.summarizeVideo.execute(p);
      if (r.isFail()) throw new Error(r.error);
      if (r.value.outcome === 'skipped-no-transcript') {
        container.logger.warn('video-summarize skipped — no transcript', { projectId: p.projectId, videoId: p.videoId });
      }
      if (r.value.outcome === 'skipped-summary-failed') {
        container.logger.warn('video-summarize skipped — unusable model output', {
          projectId: p.projectId,
          videoId: p.videoId,
          reason: r.value.reason,
        });
      }
      // Per-video chain continues into comment analysis (the last per-video step)
      // even when summarization was skipped, so the convergence barrier still
      // decrements for this video.
      await container.queue.enqueue(
        'analyze-comments',
        { projectId: p.projectId, videoId: p.videoId },
        { jobId: `analyze-comments:${p.projectId}:${p.videoId}` },
      );
    },
  });

  const analyzeComments = makeWorker(connection, container, {
    name: 'analyze-comments',
    ...QUEUE_CONFIG['analyze-comments'],
    payloadSchema: VideoJob,
    handler: async (p) => {
      const r = await useCases.analyzeComments.execute(p);
      if (r.isFail()) throw new Error(r.error);
      // Convergence barrier for the entire per-video chain. The countdown counter
      // still drives the UI, but the advance decision is DB-authoritative: advance
      // when every video already has comment insights. That self-heals a drifted
      // counter (e.g. a decrement lost to a worker restart) that would otherwise
      // wedge the project forever on the per-video phase.
      const pid = ProjectId.from(p.projectId);
      const remaining = await container.repositories.projects.decrementPending(pid, 'VIDEO_PIPELINE');
      let converged = remaining <= 0;
      if (!converged) {
        const [analyzed, total] = await Promise.all([
          container.repositories.knowledge.countCommentInsights(pid),
          container.repositories.videos.countByProject(pid),
        ]);
        converged = total > 0 && analyzed >= total;
      }
      if (converged) await orchestrator.reachStage(p.projectId, 'BUILDING_KNOWLEDGE_BASE');
    },
  });

  const knowledgeBase = makeWorker(connection, container, {
    name: 'knowledge-base',
    ...QUEUE_CONFIG['knowledge-base'],
    payloadSchema: ProjectJob,
    handler: async (p) => {
      const r = await useCases.buildKnowledgeBase.execute(p);
      if (r.isFail()) throw new Error(r.error);
      await orchestrator.advance(p.projectId, 'BUILDING_KNOWLEDGE_BASE');
    },
  });

  const bookStrategy = makeWorker(connection, container, {
    name: 'book-strategy',
    ...QUEUE_CONFIG['book-strategy'],
    payloadSchema: ProjectJob,
    handler: async (p) => {
      const r = await useCases.generateBookStrategy.execute(p);
      if (r.isFail()) throw new Error(r.error);
      await orchestrator.advance(p.projectId, 'GENERATING_BOOK_STRATEGY');
    },
  });

  const outline = makeWorker(connection, container, {
    name: 'outline-generate',
    ...QUEUE_CONFIG['outline-generate'],
    payloadSchema: ProjectJob,
    handler: async (p) => {
      // This use case materializes chapters, sets the chapter-research barrier,
      // advances to GENERATING_CHAPTER_RESEARCH and fans out the research jobs.
      const r = await useCases.generateOutline.execute(p);
      if (r.isFail()) throw new Error(r.error);
    },
  });

  const chapterResearch = makeWorker(connection, container, {
    name: 'chapter-research',
    ...QUEUE_CONFIG['chapter-research'],
    payloadSchema: ChapterResearchJob,
    handler: async (p) => {
      const r = await useCases.generateChapterResearch.execute(p);
      if (r.isFail()) throw new Error(r.error);
      // Barrier: when every chapter has research, start chapter generation.
      const remaining = await container.repositories.projects.decrementPending(
        ProjectId.from(p.projectId),
        'GENERATING_CHAPTER_RESEARCH',
      );
      if (remaining <= 0) {
        const started = await useCases.startChapterGeneration.execute({ projectId: p.projectId });
        if (started.isFail()) throw new Error(started.error);
      }
    },
  });

  const chapterGenerate = makeWorker(connection, container, {
    name: 'chapter-generate',
    ...QUEUE_CONFIG['chapter-generate'],
    payloadSchema: ChapterJob,
    handler: async (p) => {
      const r = await useCases.generateChapter.execute(p);
      if (r.isFail()) throw new Error(r.error);
      // Regeneration jobs are user-triggered and must not move the pipeline barrier.
      if (p.mode === 'generate') {
        await orchestrator.onStageItemCompleted(p.projectId, 'GENERATING_CHAPTERS');
      }
      return r.value;
    },
  });

  // Phase 12 controller — sets the polish fan-in barrier and fans out one
  // polish-chapter job per chapter. Does NOT advance; the barrier does.
  const polishBook = makeWorker(connection, container, {
    name: 'polish-book',
    ...QUEUE_CONFIG['polish-book'],
    payloadSchema: ProjectJob,
    handler: async (p) => {
      const r = await useCases.startBookPolish.execute(p);
      if (r.isFail()) throw new Error(r.error);
      return r.value;
    },
  });

  const polishChapter = makeWorker(connection, container, {
    name: 'polish-chapter',
    ...QUEUE_CONFIG['polish-chapter'],
    payloadSchema: PolishChapterJob,
    handler: async (p) => {
      const r = await useCases.polishChapter.execute(p);
      if (r.isFail()) throw new Error(r.error);
      // Barrier: when every chapter is polished, advance POLISHING_BOOK → ASSEMBLING.
      await orchestrator.onStageItemCompleted(p.projectId, 'POLISHING_BOOK');
      return r.value;
    },
  });

  // Phase 13 — async generation of a long-form extra-content unit (bonus chapter).
  // User-triggered: does NOT touch the pipeline barrier.
  const extraContent = makeWorker(connection, container, {
    name: 'extra-content',
    ...QUEUE_CONFIG['extra-content'],
    payloadSchema: ExtraContentJob,
    handler: async (p) => {
      const r = await useCases.generateExtraContent.execute(p);
      if (r.isFail()) throw new Error(r.error);
      return r.value;
    },
  });

  const assemble = makeWorker(connection, container, {
    name: 'ebook-assemble',
    ...QUEUE_CONFIG['ebook-assemble'],
    payloadSchema: ProjectJob,
    handler: async (p) => {
      // Give the book its publishing structure (Preface, Introduction, Conclusion),
      // its cover illustration, and its in-chapter illustrations before assembling.
      // All three are independent and STRICTLY best-effort — a thrown error (e.g. a
      // missing column before its migration runs) must degrade gracefully, never
      // abort assembly. allSettled keeps one failure from taking down the others.
      const [matterS, coverS, illustrationsS] = await Promise.allSettled([
        useCases.generateFrontBackMatter.execute(p),
        useCases.generateCoverImage.execute(p),
        useCases.generateIllustrations.execute(p),
      ]);

      if (matterS.status === 'rejected') {
        container.logger.warn('front/back matter generation threw; assembling without it', {
          projectId: p.projectId,
          error: String(matterS.reason),
        });
      } else if (matterS.value.isFail()) {
        container.logger.warn('front/back matter generation failed; assembling without it', {
          projectId: p.projectId,
          error: matterS.value.error,
        });
      }
      if (coverS.status === 'rejected') {
        container.logger.warn('cover image generation threw; using typographic cover', {
          projectId: p.projectId,
          error: String(coverS.reason),
        });
      } else if (coverS.value.isFail()) {
        container.logger.warn('cover image generation failed; using typographic cover', {
          projectId: p.projectId,
          error: coverS.value.error,
        });
      }
      if (illustrationsS.status === 'rejected') {
        container.logger.warn('illustration generation threw; assembling without illustrations', {
          projectId: p.projectId,
          error: String(illustrationsS.reason),
        });
      } else if (illustrationsS.value.isFail()) {
        container.logger.warn('illustration generation failed; assembling without illustrations', {
          projectId: p.projectId,
          error: illustrationsS.value.error,
        });
      } else {
        const { generated, attempted, error } = illustrationsS.value.value;
        if (attempted === 0) {
          // Nothing was even attempted — make the reason visible instead of silent:
          // either the option is off for this project or no chapter was eligible.
          container.logger.info('no illustrations attempted (feature off for this project or no eligible chapters)', {
            projectId: p.projectId,
          });
        }
        if (attempted > 0 && generated < attempted) {
          // Some/all images failed (e.g. 69labs error or out of credits). Surface
          // the first reason so an empty/short bucket is diagnosable, not silent.
          container.logger.warn('some in-chapter illustrations failed to generate', {
            projectId: p.projectId,
            generated,
            attempted,
            sampleError: error,
          });
        }
        if (generated > 0) {
          container.logger.info('🖼️  generated in-chapter illustrations', {
            projectId: p.projectId,
            generated,
            attempted,
          });
        }
      }
      const assembled = await useCases.assembleEbook.execute(p);
      if (assembled.isFail()) throw new Error(assembled.error);
      // Advance to EXPORTING; the orchestrator enqueues the export entry job.
      await orchestrator.advance(p.projectId, 'ASSEMBLING');
      return { chapters: assembled.value.chapters.length };
    },
  });

  const exportWorker = makeWorker(connection, container, {
    name: 'export',
    ...QUEUE_CONFIG.export,
    payloadSchema: ExportJob,
    handler: async (p) => {
      const assembled = await useCases.assembleEbook.execute({ projectId: p.projectId });
      if (assembled.isFail()) throw new Error(assembled.error);
      const formats =
        p.format === 'both' ? [ExportFormat.PDF, ExportFormat.DOCX] : [p.format === 'pdf' ? ExportFormat.PDF : ExportFormat.DOCX];
      // Each (re-)export lands at its own version so an edit-then-re-export writes a
      // NEW storage path (no stale-CDN read on an overwritten object) and the editor
      // can detect the fresh PDF by watching for a higher version.
      const bookVersion = (await container.repositories.artifacts.latestVersion(ProjectId.from(p.projectId))) + 1;
      const r = await useCases.exportEbook.execute({ projectId: p.projectId, doc: assembled.value, formats, bookVersion });
      if (r.isFail()) throw new Error(r.error);
      await orchestrator.advance(p.projectId, 'EXPORTING'); // → COMPLETED (no-op on a manual re-export)
      container.logger.info('📄 export complete', { projectId: p.projectId, bookVersion, formats: formats.length });
      return r.value;
    },
  });

  return [
    channelIngest,
    videoData,
    transcriptFetch,
    whisper,
    videoSummarize,
    analyzeComments,
    knowledgeBase,
    bookStrategy,
    outline,
    chapterResearch,
    chapterGenerate,
    polishBook,
    polishChapter,
    extraContent,
    assemble,
    exportWorker,
  ];
}

/** Enqueue the per-video summarize step (deterministic id → idempotent). */
async function enqueueSummarize(container: Container, projectId: string, videoId: string): Promise<void> {
  await container.queue.enqueue(
    'video-summarize',
    { projectId, videoId },
    { jobId: `video-summarize:${projectId}:${videoId}` },
  );
}
