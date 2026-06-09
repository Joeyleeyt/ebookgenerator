import { ValueObject } from '../shared/ValueObject.js';

/** Translates a page target into word budgets used to size chapters. */
export class PageBudget extends ValueObject<{ pages: number }> {
  static readonly WORDS_PER_PAGE = 450;

  static of(pages: number): PageBudget {
    return new PageBudget({ pages });
  }

  get pages(): number {
    return this.props.pages;
  }

  totalWords(): number {
    return this.props.pages * PageBudget.WORDS_PER_PAGE;
  }

  /** ~100 pages → ~45,000 words → ~12 chapters × ~3,750 words. */
  perChapterWords(chapterCount: number): number {
    if (chapterCount <= 0) return 0;
    return Math.round(this.totalWords() / chapterCount);
  }

  static pagesFromWords(words: number): number {
    return Math.ceil(words / PageBudget.WORDS_PER_PAGE);
  }
}
