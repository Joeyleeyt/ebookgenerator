import { z } from 'zod';
import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { ChannelKnowledgeBase } from '../../domain/channel/ChannelKnowledgeBase.js';
import type { ChannelRepository } from '../ports/repositories/ChannelRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { Hasher } from '../ports/Hasher.js';
import { KnowledgeBasePrompt } from '../prompts/KnowledgeBasePrompt.js';
import { parseJsonCompletion } from '../prompts/parse.js';
import type { ProjectJob } from '../dto/jobs.dto.js';

const Schema = z.object({
  coreThemes: z.array(z.string()),
  corePrinciples: z.array(z.string()),
  recurringAdvice: z.array(z.string()),
  commonMistakes: z.array(z.string()),
  audiencePainPoints: z.array(z.string()),
  audienceGoals: z.array(z.string()),
  transformationJourney: z.string(),
  expertPositioning: z.string(),
  hiddenInsights: z.array(z.string()),
});

/** Phase 7 (Claude Sonnet): reduce video knowledge + comment insights into a knowledge base. */
export class BuildKnowledgeBaseUseCase {
  constructor(
    private readonly channels: ChannelRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly ai: AiTextGenerator,
    private readonly hasher: Hasher,
  ) {}

  async execute(cmd: ProjectJob): Promise<Result<void>> {
    const projectId = ProjectId.from(cmd.projectId);
    const summaries = await this.channels.listVideoSummaries(projectId);
    if (summaries.length === 0) return Result.fail('No video summaries available');
    const insights = await this.knowledge.listCommentInsights(projectId);

    const inputHash = this.hasher.hash({
      s: summaries.map((s) => s.inputHash).sort(),
      c: insights.map((i) => i.inputHash).sort(),
    });
    const existing = await this.knowledge.getKnowledgeBase(projectId);
    if (existing?.inputHash === inputHash) return Result.ok(); // idempotent

    const channel = await this.channels.getChannel(projectId);
    const prompt = KnowledgeBasePrompt.build({
      channelTitle: channel?.title ?? 'Unknown channel',
      videoSummaries: summaries.map((s) => s.toText()),
      commentInsights: insights.map((i) => i.toText()).filter(Boolean),
    });
    const completion = await this.ai.generate({
      model: 'claude-sonnet-4-6',
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      maxTokens: 2500,
      metadata: { projectId: cmd.projectId, stage: 'knowledge-base' },
    });
    if (completion.isFail()) return Result.fail(completion.error.type);

    const parsed = parseJsonCompletion(completion.value.text, Schema);
    if (parsed.isFail()) return Result.fail(parsed.error);

    await this.knowledge.saveKnowledgeBase(projectId, ChannelKnowledgeBase.create({ ...parsed.value, inputHash }));
    return Result.ok();
  }
}
