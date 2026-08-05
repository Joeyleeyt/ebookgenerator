import { describe, it, expect } from 'vitest';
import { Palette, type LandingCopy, type LandingPageModel, type LandingProduct } from '@yeg/core';
import { GeneratedPageAssembler } from './GeneratedPageAssembler.js';

const copy: LandingCopy = {
  eyebrow: '',
  headline: 'A headline',
  subheadline: 'A subheadline',
  ctaLabel: 'Get the book',
  painPoints: [],
  whatsInsideHeading: '',
  bullets: [],
  whoIsItForHeading: '',
  whoIsItFor: [],
  authorHeading: '',
  authorBio: '',
  faqs: [],
  categoryLabel: '',
  productFeatures: [],
  comparisonWithout: [],
  comparisonWith: [],
  closingHeading: '',
  closingBody: '',
  fontFamily: 'sans',
  templateSections: [],
};

function product(over: Partial<LandingProduct> = {}): LandingProduct {
  return {
    title: 'A Book',
    subtitle: '',
    coverDataUri: null,
    pageCount: 100,
    categoryLabel: null,
    features: [],
    contents: [],
    sections: [],
    priceCents: 2700,
    compareAtCents: null,
    checkoutUrl: 'https://example.com/a',
    kind: 'book',
    ...over,
  };
}

function model(products: LandingProduct[]): LandingPageModel {
  return {
    copy,
    palette: Palette.neutral(),
    currency: 'USD',
    guaranteeDays: 30,
    author: null,
    channelTitle: null,
    subscriberCount: null,
    testimonials: [],
    products,
    siteName: 'Site',
    logoDataUri: null,
    stats: [],
    heroImageDataUri: null,
    authorPhotoDataUri: null,
    authorCredential: null,
    promoEndsAt: null,
    rating: null,
    valueStack: [],
    costComparison: null,
    paymentMethods: [],
    edition: null,
  };
}

const assemble = (bodyHtml: string, products: LandingProduct[]) =>
  new GeneratedPageAssembler().assemble({ page: { css: '', bodyHtml }, model: model(products) });

const THREE = [
  product({ title: 'Book One', coverDataUri: 'data:image/png;base64,ONE', featured: true, contents: ['Alpha'] }),
  product({ title: 'Book Two', coverDataUri: 'data:image/png;base64,TWO', contents: ['Beta'] }),
  product({ title: 'Book Three', coverDataUri: 'data:image/png;base64,THREE', contents: ['Gamma'] }),
];

describe('GeneratedPageAssembler — per-book elements', () => {
  // {{COVER}} renders the featured book however often it appears, so a
  // three-book page built from repeats showed one book three times.
  it('gives every book its own cover in the breakdown', () => {
    const html = assemble('<section>{{BOOK_BREAKDOWN}}</section>', THREE);

    for (const slug of ['ONE', 'TWO', 'THREE']) {
      expect(html).toContain(`data:image/png;base64,${slug}`);
    }
    // Each block must pair a title with the cover that belongs to it.
    const blocks = html.split('<div class="book">').slice(1);
    expect(blocks).toHaveLength(3);
    for (const [title, slug] of [
      ['Book One', 'ONE'],
      ['Book Two', 'TWO'],
      ['Book Three', 'THREE'],
    ] as Array<[string, string]>) {
      const block = blocks.find((b) => b.includes(title));
      expect(block, `no block for ${title}`).toBeDefined();
      expect(block).toContain(`base64,${slug}`);
    }
  });

  it('lists each book with its own contents, not the featured book’s', () => {
    const html = assemble('<section>{{BOOK_BREAKDOWN}}</section>', THREE);
    expect(html).toContain('Alpha');
    expect(html).toContain('Beta');
    expect(html).toContain('Gamma');
  });

  it('shows every cover in the stack too', () => {
    const html = assemble('<section>{{COVER_STACK}}</section>', THREE);
    for (const slug of ['ONE', 'TWO', 'THREE']) {
      expect(html).toContain(`data:image/png;base64,${slug}`);
    }
  });

  // The bundle has no cover of its own; it must not become a fourth book.
  it('leaves the bundle out of both', () => {
    const withBundle = [...THREE, product({ title: 'The complete set', kind: 'bundle', coverDataUri: null })];
    const html = assemble('<section>{{BOOK_BREAKDOWN}}{{COVER_STACK}}</section>', withBundle);
    expect(html.split('<div class="book">').length - 1).toBe(3);
    expect(html).not.toContain('The complete set');
  });

  // The copy's ctaLabel names the FEATURED book, so reusing it across the offer
  // grid put "Get The DIY Repair Bible" on every card, bundle included.
  it('labels each offer button by price, never by the featured book', () => {
    const withBundle = [
      ...THREE,
      product({ title: 'The complete set', kind: 'bundle', priceCents: 8000, coverDataUri: null }),
    ];
    const html = assemble('<section>{{OFFER_GRID}}</section>', withBundle);

    expect(html).toContain('Get it for $27');
    expect(html).toContain('Get it for $80');
    // The global label belongs to the hero, not to a card.
    const cards = html.split(/<div class="offer[" ]/).slice(1);
    for (const card of cards) expect(card).not.toContain('Get the book —');
  });

  it('keeps each offer button pointing at its own checkout link', () => {
    const html = assemble(
      '<section>{{OFFER_GRID}}</section>',
      THREE.map((p, i) => ({ ...p, checkoutUrl: `https://example.com/book-${i + 1}` })),
    );
    for (let i = 1; i <= 3; i++) expect(html).toContain(`https://example.com/book-${i}`);
  });

  it('falls back to a typographic tile when a book has no cover', () => {
    const html = assemble('<section>{{BOOK_BREAKDOWN}}</section>', [product({ title: 'Coverless', coverDataUri: null })]);
    expect(html).toContain('cover-fallback');
    expect(html).toContain('Coverless');
  });
});
