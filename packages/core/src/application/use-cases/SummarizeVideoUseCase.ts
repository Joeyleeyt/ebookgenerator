import { Result } from '../../domain/shared/Result.js';
import { VideoId } from '../../domain/video/VideoId.js';
import { VideoSummary } from '../../domain/video/VideoSummary.js';
import type { VideoRepository } from '../ports/repositories/VideoRepository.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { Hasher } from '../ports/Hasher.js';
import { VideoSummaryPrompt } from '../prompts/VideoSummaryPrompt.js';
import { parseJsonCompletion } from '../prompts/parse.js';
import { z } from 'zod';
import type { VideoJob } from '../dto/jobs.dto.js';

const SummarySchema = z.object({
  summary: z.string(),
  keyLessons: z.array(z.string()),
  mistakes: z.array(z.string()),
  frameworks: z.array(z.string()),
  actionableTips: z.array(z.string()),
  successStories: z.array(z.string()),
  caseStudies: z.array(z.string()),
  audienceProblems: z.array(z.string()),
  audienceGoals: z.array(z.string()),
  recurringAdvice: z.array(z.string()),
});

/** Map step: per-video summary via Claude Sonnet. */
export class SummarizeVideoUseCase {
  constructor(
    private readonly videos: VideoRepository,
    private readonly ai: AiTextGenerator,
    private readonly hasher: Hasher,
  ) {}

  async execute(cmd: VideoJob): Promise<Result<void>> {
    const video = await this.videos.findById(VideoId.from(cmd.videoId));
    if (!video) return Result.fail('Video not found');
    if (!video.transcript) return Result.fail('Video has no transcript');

    const inputHash = this.hasher.hash({
      transcript: video.transcript.inputHash,
      comments: video.comments.map((c) => c.text),
    });
    if (video.summary?.inputHash === inputHash) return Result.ok(); // idempotent

    const prompt = VideoSummaryPrompt.build({
      title: video.title,
      transcript: video.transcript.text,
      comments: video.comments.map((c) => c.text).slice(0, 50),
    });
    const completion = await this.ai.generate({
      model: 'claude-sonnet-4-6',
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      maxTokens: 2800,
      metadata: { projectId: cmd.projectId, stage: 'video-summarize' },
    });
    if (completion.isFail()) return Result.fail(completion.error.type);

    const parsed = parseJsonCompletion(completion.value.text, SummarySchema);
    if (parsed.isFail()) return Result.fail(parsed.error);

    const attach = video.attachSummary(
      VideoSummary.create({ ...parsed.value, model: completion.value.model, inputHash }),
    );
    if (attach.isFail()) return Result.fail(attach.error);
    await this.videos.save(video);
    return Result.ok();
  }
}
