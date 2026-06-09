import type { Result } from '../../../domain/shared/Result.js';
import type { RawTranscript } from './TranscriptProvider.js';

/** Whisper fallback — only invoked when no captions are available. */
export interface SpeechToText {
  transcribe(audioRef: string): Promise<Result<RawTranscript>>;
}
