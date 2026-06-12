import { ValueObject } from '../shared/ValueObject.js';

/** Translates a page target into word budgets used to size chapters. */
export class PageBudget extends ValueObject<{ pages: number }> {
  // Calibrated to FINISHED pages, not a solid text page. Real books render ~300
  // words per finished page once chapter openers, mid-chapter page breaks, front
  // matter and paragraph spacing are accounted for — a theoretical 450 produced
  // ~50% too many pages (a "100-page" target came out ~151). Tuned from real runs:
  // 450 × (100/151) ≈ 300. Raise it → fewer pages; lower it → more pages.
  static readonly WORDS_PER_PAGE = 300;

  static of(pages: number): PageBudget {
    return new PageBudget({ pages });
  }

  get pages(): number {
    return this.props.pages;
  }

  totalWords(): number {
    return this.props.pages * PageBudget.WORDS_PER_PAGE;
  }

  /** ~100 pages → ~30,000 words → 14 chapters × ~2,140 words (the model overshoots
   *  the target, which is why the budget is set below a full page's word count). */
  perChapterWords(chapterCount: number): number {
    if (chapterCount <= 0) return 0;
    return Math.round(this.totalWords() / chapterCount);
  }

  static pagesFromWords(words: number): number {
    return Math.ceil(words / PageBudget.WORDS_PER_PAGE);
  }
}
