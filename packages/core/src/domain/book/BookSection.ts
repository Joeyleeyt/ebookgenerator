import { Entity } from '../shared/Entity.js';
import { BookSectionId } from './ids.js';
import type { ContentStatus } from './Section.js';

/** The 8 optional extra-content types from logic.md Phase 13. */
export const ExtraContentKind = {
  INTRODUCTION: 'introduction',
  FOREWORD: 'foreword',
  CONCLUSION: 'conclusion',
  FAQ: 'faq',
  BONUS_CHAPTER: 'bonus_chapter',
  RESOURCES: 'resources',
  CHECKLIST: 'checklist',
  GLOSSARY: 'glossary',
} as const;
export type ExtraContentKind = (typeof ExtraContentKind)[keyof typeof ExtraContentKind];

export type Placement = 'front' | 'back';

/** Front matter precedes the chapters; everything else is back matter. */
export function placementOf(kind: ExtraContentKind): Placement {
  return kind === ExtraContentKind.INTRODUCTION || kind === ExtraContentKind.FOREWORD ? 'front' : 'back';
}

/** Bonus chapters are full-length and generated asynchronously via the queue. */
export function isLongForm(kind: ExtraContentKind): boolean {
  return kind === ExtraContentKind.BONUS_CHAPTER;
}

interface BookSectionProps {
  bookId: string;
  kind: ExtraContentKind;
  placement: Placement;
  position: number;
  title: string;
  prompt: string | null;
  content: string | null;
  status: ContentStatus;
}

/** A book-level extra-content unit (front/back matter), distinct from a chapter Section. */
export class BookSection extends Entity<BookSectionProps, BookSectionId> {
  static create(input: {
    id: BookSectionId;
    bookId: string;
    kind: ExtraContentKind;
    position: number;
    title: string;
    prompt: string | null;
    status?: ContentStatus;
  }): BookSection {
    return new BookSection(
      {
        bookId: input.bookId,
        kind: input.kind,
        placement: placementOf(input.kind),
        position: input.position,
        title: input.title,
        prompt: input.prompt,
        content: null,
        status: input.status ?? 'PENDING',
      },
      input.id,
    );
  }
  static rehydrate(props: BookSectionProps, id: BookSectionId): BookSection {
    return new BookSection(props, id);
  }

  get kind() {
    return this.props.kind;
  }
  get placement() {
    return this.props.placement;
  }
  get position() {
    return this.props.position;
  }
  get title() {
    return this.props.title;
  }
  get prompt() {
    return this.props.prompt;
  }
  get content() {
    return this.props.content;
  }
  get status() {
    return this.props.status;
  }

  fill(content: string): void {
    this.props.content = content;
    this.props.status = 'DONE';
  }
}
