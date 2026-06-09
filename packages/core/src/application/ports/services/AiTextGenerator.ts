import type { Result } from '../../../domain/shared/Result.js';

export type ClaudeModel = 'claude-haiku-4-5' | 'claude-sonnet-4-6' | 'claude-opus-4-8';

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiCompletion {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  stopReason: string | null;
}

export interface AiGenerateInput {
  model: ClaudeModel;
  system: string;
  messages: AiMessage[];
  maxTokens: number;
  /** Mark the system prefix as cacheable so shared context is reused across calls. */
  cacheControl?: { systemPrefix?: boolean };
  metadata?: { projectId: string; stage: string };
}

export type AiError =
  | { type: 'rate_limited'; retryAfterMs?: number }
  | { type: 'overloaded' }
  | { type: 'invalid_request'; message: string }
  | { type: 'unknown'; message: string };

/** The only AI provider abstraction. Implemented by ClaudeTextGenerator. */
export interface AiTextGenerator {
  generate(input: AiGenerateInput): Promise<Result<AiCompletion, AiError>>;
}
