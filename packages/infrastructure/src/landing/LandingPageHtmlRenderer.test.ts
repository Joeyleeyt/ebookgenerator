import { describe, it, expect } from 'vitest';
import { Palette, type LandingCopy, type LandingPageModel, type LandingProduct } from '@yeg/core';
import { LandingPageHtmlRenderer } from './LandingPageHtmlRenderer.js';

const copy: LandingCopy = {
  eyebrow: 'For weekend mechanics',
  headline: 'Stop paying for repairs you could do yourself',
  subheadline: 'The workshop manual for people who own a car, not a garage.',
  ctaLabel: 'Get the manual',
  painPoints: ['Shops charge for diagnosis you can do in ten minutes.'],
  whatsInsideHeading: 'The manual',
  bullets: [{ title: 'Read the dashboard', body: 'Know which warnings mean stop now.' }],
  whoIsItForHeading: 'Who this is for',
  whoIsItFor: ['You keep a car past its warranty.'],
  authorHeading: 'About the author',
  authorBio: 'Nineteen years under other cars.',
  faqs: [{ question: 'What format?', answer: 'PDF and DOCX.' }],
  categoryLabel: 'Repair manual',
  productFeatures: ['101 fixes, step by step'],
  comparisonWithout: ['You pay the shop rate.'],
  comparisonWith: ['You do it yourself.'],
  closingHeading: 'Fix it yourself',
  closingBody: 'One repair pays for the book.',
  fontFamily: 'serif',
};

function product(overrides: Partial<LandingProduct> = {}): LandingProduct {
  return {
    title: 'The Mechanic Bible',
    subtitle: 'Fix it yourself',
    coverDataUri: null,
    pageCount: 120,
    categoryLabel: 'Repair manual',
    features: ['101 fixes, step by step'],
    contents: ['Reading the dashboard'],
    sections: [
      { title: 'Reading the dashboard', items: ['Amber vs red', 'When to stop now'] },
      { title: 'Pricing a job', items: ['Parts vs labour'] },
    ],
    priceCents: 4700,
    compareAtCents: 7700,
    checkoutUrl: 'https://payhip.com/b/AbC9',
    ...overrides,
  };
}

function model(overrides: Partial<LandingPageModel> = {}): LandingPageModel {
  return {
    copy,
    palette: Palette.fromSeed({ r: 30, g: 60, b: 120 }),
    currency: 'USD',
    guaranteeDays: 30,
    author: 'Adrian',
    channelTitle: 'Car Care Garage',
    subscriberCount: 280_000,
    testimonials: [],
    products: [product()],
    siteName: 'The Mechanic Bible',
    stats: [],
    heroImageDataUri: null,
    authorPhotoDataUri: null,
    authorCredential: 'Adrian · Car Care Garage',
    promoEndsAt: null,
    rating: null,
    valueStack: [],
    costComparison: null,
    paymentMethods: ['Visa', 'Mastercard'],
    edition: 'MMXXVI · No. I',
    ...overrides,
  };
}

const render = (m: LandingPageModel) => new LandingPageHtmlRenderer().render(m);

describe('LandingPageHtmlRenderer', () => {
  it('renders a complete standalone document', () => {
    const html = render(model());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Stop paying for repairs you could do yourself');
    expect(html).toContain('The workshop manual for people who own a car');
    expect(html).toContain('MMXXVI · No. I');
  });

  // The page must render from a static host with no network at all.
  it('fetches nothing from the network', () => {
    const html = render(model({ products: [product({ coverDataUri: 'data:image/png;base64,AQID' })] }));
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/src="https?:/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.every((h) => h === 'https://payhip.com/b/AbC9')).toBe(true);
  });

  it('puts the checkout URL on every CTA, byte for byte', () => {
    const url = 'https://payhip.com/b/AbC9?ref=a&b=1';
    const html = render(model({ products: [product({ checkoutUrl: url })] }));
    // &amp; in the attribute is the correct HTML encoding of the same URL.
    const occurrences = html.split('href="https://payhip.com/b/AbC9?ref=a&amp;b=1"').length - 1;
    expect(occurrences).toBe(2); // the order section and the last call
    expect(html).not.toContain('<span class="cta" aria-disabled');
  });

  it('renders inert buttons when no checkout link is set yet', () => {
    const html = render(model({ products: [product({ checkoutUrl: null })] }));
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('Checkout link not set yet');
    expect(html).not.toContain('href="https://payhip.com');
  });

  // Copy comes from a model and prices/links from a user; neither may become markup.
  it('escapes hostile content instead of executing it', () => {
    const html = render(
      model({
        copy: { ...copy, headline: '<script>alert(1)</script>', authorBio: '" onload="alert(2)' },
        products: [product({ checkoutUrl: 'https://x.test/"><script>alert(3)</script>' })],
      }),
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('onload="alert(2)"');
    expect(html).not.toContain('"><script>alert(3)');
  });

  it('formats prices, showing the anchor price only when it is higher', () => {
    expect(render(model())).toContain('$47');
    expect(render(model())).toContain('class="price-was">$77');
    expect(render(model({ products: [product({ compareAtCents: 2000 })] }))).not.toContain(
      '<span class="price-was">',
    );
    expect(render(model({ products: [product({ priceCents: 4750, compareAtCents: null })] }))).toContain('$47.50');
    expect(render(model({ currency: 'EUR' }))).toContain('€47');
  });

  describe('section numbering', () => {
    it('numbers the sections in roman numerals', () => {
      const html = render(model());
      expect(html).toContain('<p class="mark">I</p>');
      expect(html).toContain('<p class="mark">II</p>');
    });

    // Skipping a numeral looks like a rendering bug to a reader, and every
    // optional section here is routinely absent.
    it('closes the numbering up when sections are omitted', () => {
      const bare = render(model({ costComparison: null, testimonials: [] }));
      const marks = [...bare.matchAll(/<p class="mark">([IVX]+)<\/p>/g)].map((m) => m[1]);
      expect(marks).toEqual(['I', 'II', 'III', 'IV']);

      const full = render(
        model({
          testimonials: [{ quote: 'Saved me a fortune.', author: 'Dana, TX' }],
          costComparison: {
            beforeLabel: 'Before',
            afterLabel: 'After',
            rows: [{ label: 'Servicing', beforeCents: 120000, afterCents: 40000 }],
            source: 'Figures supplied by the publisher.',
          },
        }),
      );
      const fullMarks = [...full.matchAll(/<p class="mark">([IVX]+)<\/p>/g)].map((m) => m[1]);
      expect(fullMarks).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
    });
  });

  describe('claims that cannot be generated', () => {
    // Each of these is a factual assertion — about a deadline, real reviewers,
    // products that exist, or money a reader will save. The page must stay
    // silent rather than invent one.
    it('shows no countdown without a real end date', () => {
      expect(render(model())).not.toContain('Launch price ends in');
      const withDate = render(model({ promoEndsAt: '2026-09-01T00:00:00Z' }));
      expect(withDate).toContain('Launch price ends in');
      expect(withDate).toContain('data-ends="2026-09-01T00:00:00Z"');
    });

    it('hides the countdown once the deadline passes rather than resetting it', () => {
      // A timer that restarts each visit is a false urgency claim.
      const html = render(model({ promoEndsAt: '2026-09-01T00:00:00Z' }));
      expect(html).toContain('if (left <= 0)');
      expect(html).toContain("promo.style.display = 'none'");
      expect(html).not.toMatch(/Date\.now\(\)\s*\+/); // never "now + 24h"
    });

    it('shows no star rating unless one was supplied', () => {
      expect(render(model())).not.toContain('★ from');
      expect(render(model({ rating: { score: 4.9, count: 312 } }))).toContain('4.9★ from 312 readers');
    });

    it('shows the value stack only when its line items exist', () => {
      expect(render(model())).not.toContain('Total value');
      const stacked = render(
        model({ valueStack: [{ label: 'The manual', valueCents: 4700 }, { label: 'Lifetime updates', valueCents: 2100 }] }),
      );
      expect(stacked).toContain('Total value');
      expect(stacked).toContain('$68'); // 47 + 21
      expect(stacked).toContain('You pay today');
    });

    it('omits the arithmetic table entirely without supplied figures', () => {
      expect(render(model())).not.toContain('The arithmetic');
    });

    it('always prints a source beside the arithmetic', () => {
      const html = render(
        model({
          costComparison: {
            beforeLabel: 'Now',
            afterLabel: 'After',
            rows: [
              { label: 'Servicing', beforeCents: 120000, afterCents: 40000 },
              { label: 'Parts', beforeCents: 60000, afterCents: 30000 },
            ],
            source: 'Figures from the publisher’s 2026 survey.',
          },
        }),
      );
      expect(html).toContain('The arithmetic');
      expect(html).toContain('$1800'); // totals row: 1200 + 600
      expect(html).toContain('$700'); // 400 + 300
      expect(html).toContain('class="source"');
      expect(html).toContain('2026 survey');
    });

    it('renders reader results only from real quotes', () => {
      expect(render(model())).not.toContain('Reader results');
      const withQuotes = render(model({ testimonials: [{ quote: 'It paid for itself.', author: 'Dana, TX' }] }));
      expect(withQuotes).toContain('Reader results');
      expect(withQuotes).toContain('It paid for itself.');
    });
  });

  it('builds the contents from the book’s own outline, with counts', () => {
    const html = render(model());
    expect(html).toContain('Reading the dashboard');
    expect(html).toContain('2 methods');
    expect(html).toContain('1 method'); // singular, not "1 methods"
    expect(html).toContain('Amber vs red');
  });

  it('falls back to the model’s bullets when the outline is empty', () => {
    const html = render(model({ products: [product({ sections: [] })] }));
    expect(html).toContain('Know which warnings mean stop now.');
  });

  it('shows the payment marks it was given', () => {
    expect(render(model())).toContain('>Visa</span>');
    expect(render(model({ paymentMethods: [] }))).not.toContain('class="pay"');
  });

  it('omits sections it has no content for', () => {
    const html = render(model({ copy: { ...copy, painPoints: [], faqs: [], whoIsItFor: [] }, guaranteeDays: 0 }));
    expect(html).not.toContain('<details>');
    expect(html).not.toContain('money-back guarantee');
    expect(html).not.toContain('class="pains');
  });

  it('drives its colours from the palette', () => {
    const palette = Palette.fromSeed({ r: 200, g: 20, b: 24 });
    const html = render(model({ palette }));
    expect(html).toContain(`--accent: ${palette.toJSON().accent}`);
    expect(html).toContain(`--bg: ${palette.toJSON().background}`);
  });

  it('switches typeface on the copy’s own judgement', () => {
    expect(render(model())).toContain('Georgia');
    expect(render(model({ copy: { ...copy, fontFamily: 'sans' } }))).toContain('Helvetica Neue');
  });

  describe('scroll animation', () => {
    it('marks the blocks that reveal on scroll', () => {
      const html = render(model());
      expect(html).toContain('class="reveal"');
      expect(html).toContain('class="pains stagger"');
      expect(html).toContain('IntersectionObserver');
    });

    it('reveals each block once and stops watching it', () => {
      expect(render(model())).toContain('io.unobserve');
    });

    // The one that actually matters. If the hidden start state applied without
    // JavaScript, a blocked or broken script would leave the page blank — a dead
    // sales page nobody notices until a customer reports it.
    it('only ever hides content under the JS-set .anim class', () => {
      const css = render(model())
        .replace(/@keyframes[\s\S]*?\{[\s\S]*?\}\s*\}/g, '')
        .slice(0);
      const style = css.slice(css.indexOf('<style>'), css.indexOf('</style>'));
      for (const rule of style.split('}')) {
        if (!/opacity:\s*0[;\s]|visibility:\s*hidden/.test(rule)) continue;
        const selector = rule.split('{')[0] ?? '';
        if (selector.includes('aria-disabled')) continue; // the inert button
        expect(selector).toContain('.anim');
      }
    });

    it('un-hides the page if the observer never starts', () => {
      const html = render(model());
      expect(html).toContain('data-anim');
      expect(html).toContain("replace(' anim', '')");
    });

    it('skips reveals entirely for readers who prefer reduced motion', () => {
      const html = render(model());
      expect(html).toContain("matchMedia('(prefers-reduced-motion: reduce)').matches");
      expect(html).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('carries no inline event handlers', () => {
      expect(render(model())).not.toMatch(/\s\bon(click|load|error|mouse\w+)\s*=/i);
    });
  });
});
