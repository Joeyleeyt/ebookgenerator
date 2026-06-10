import { ValueObject } from '../shared/ValueObject.js';

export type Tone = 'educational' | 'conversational' | 'professional';

interface GenerationOptionsProps {
  targetPages: number;
  maxVideos: number;
  tone: Tone;
  includeComments: boolean;
}

export class GenerationOptions extends ValueObject<GenerationOptionsProps> {
  static create(props: Partial<GenerationOptionsProps>): GenerationOptions {
    return new GenerationOptions({
      targetPages: props.targetPages ?? 10,
      maxVideos: props.maxVideos ?? 10,
      tone: props.tone ?? 'professional',
      includeComments: props.includeComments ?? true,
    });
  }

  get targetPages() {
    return this.props.targetPages;
  }
  get maxVideos() {
    return this.props.maxVideos;
  }
  get tone() {
    return this.props.tone;
  }
  get includeComments() {
    return this.props.includeComments;
  }
}
