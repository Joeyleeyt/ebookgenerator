import { z } from 'zod';
import { Result } from '../../domain/shared/Result.js';
import { ProjectId } from '../../domain/project/ProjectId.js';
import { BookStrategy } from '../../domain/book/BookStrategy.js';
import type { ProjectRepository } from '../ports/repositories/ProjectRepository.js';
import type { KnowledgeRepository } from '../ports/repositories/KnowledgeRepository.js';
import type { AiTextGenerator } from '../ports/services/AiTextGenerator.js';
import type { Hasher } from '../ports/Hasher.js';
import { BookStrategyPrompt } from '../prompts/BookStrategyPrompt.js';
import { parseJsonCompletion } from '../prompts/parse.js';
import type { ProjectJob } from '../dto/jobs.dto.js';

const Schema = z.object({
  title: z.string(),
  subtitle: z.string(),
  targetAudience: z.string(),
  corePromise: z.string(),
  transformation: z.string(),
  authorVoice: z.string(),
  tone: z.string(),
  chapterCount: z.number(),
  targetWordCount: z.number(),
  uniqueSellingProposition: z.string(),
  keyPrinciples: z.array(z.string()),
});

/** Phase 8 (Claude Sonnet): commercial book positioning derived from the knowledge base. */
export class GenerateBookStrategyUseCase {
  constructor(
    private readonly projects: ProjectRepository,
    private readonly knowledge: KnowledgeRepository,
    private readonly ai: AiTextGenerator,
    private readonly hasher: Hasher,
  ) {}

  async execute(cmd: ProjectJob): Promise<Result<void>> {
    const projectId = ProjectId.from(cmd.projectId);
    const project = await this.projects.findById(projectId);
    if (!project) return Result.fail('Project not found');
    const kb = await this.knowledge.getKnowledgeBase(projectId);
    if (!kb) return Result.fail('Knowledge base missing');

    const inputHash = this.hasher.hash({ kb: kb.inputHash, pages: project.options.targetPages });
    const existing = await this.knowledge.getBookStrategy(projectId);
    if (existing?.inputHash === inputHash) return Result.ok(); // idempotent

    const prompt = BookStrategyPrompt.build({
      knowledgeBase: kb.toText(),
      targetPages: project.options.targetPages,
      tone: project.options.tone,
    });
    const completion = await this.ai.generate({
      model: 'claude-sonnet-4-6',
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      // 11-field strategy JSON (several prose fields + keyPrinciples) can overflow
      // 2000 and truncate into invalid JSON. max_tokens is a ceiling, billed on
      // actual output, so the extra headroom is free insurance.
      maxTokens: 4000,
      metadata: { projectId: cmd.projectId, stage: 'book-strategy' },
    });
    if (completion.isFail()) return Result.fail(completion.error.type);

    const parsed = parseJsonCompletion(completion.value.text, Schema);
    if (parsed.isFail()) return Result.fail(parsed.error);

    await this.knowledge.saveBookStrategy(projectId, BookStrategy.create({ ...parsed.value, inputHash }));
    return Result.ok();
  }
}
