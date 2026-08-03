import { describe, it, expect } from 'vitest';
import { Palette, type LandingCopy, type LandingPageModel, type LandingProduct } from '@yeg/core';
import { LandingPageHtmlRenderer } from './LandingPageHtmlRenderer.js';

const copy: LandingCopy = {
  eyebrow: 'For weekend mechanics',
  headline: 'Stop paying for repairs you could do yourself',
  subheadline: 'The workshop manual for people who own a car, not a garage.',
  ctaLabel: 'Get the manual',
  painPoints: ['Shops charge for diagnosis you can do in ten minutes.'],
  whatsInsideHeading: "What's inside",
  bullets: [{ title: 'Read the dashboard', body: 'Know which warnings mean stop now.' }],
  whoIsItForHeading: 'Who this is for',
  whoIsItFor: ['You keep a car past its warranty.'],
  authorHeading: 'About the author',
  authorBio: 'Nineteen years under other cars.',
  faqs: [{ question: 'What format?', answer: 'PDF and DOCX.' }],
  categoryLabel: 'Repair manual',
  productFeatures: ['101 fixes, step by step', 'Works on any make'],
  comparisonWithout: ['You pay the shop rate for a ten-minute job.'],
  comparisonWith: ['You do the ten-minute job yourself.'],
  closingHeading: 'Fix it yourself',
  closingBody: 'One repair pays for the book.',
  fontFamily: 'sans',
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
    stats: [
      { value: '120', label: 'Pages' },
      { value: '30', label: 'Day guarantee' },
    ],
    heroImageDataUri: null,
    authorPhotoDataUri: null,
    authorCredential: 'Adrian · Car Care Garage',
    ...overrides,
  };
}

const render = (m: LandingPageModel) => new LandingPageHtmlRenderer().render(m);

describe('LandingPageHtmlRenderer', () => {
  it('renders a complete standalone document', () => {
    const html = render(model());
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Stop paying for repairs you could do yourself');
    expect(html).toContain("What&#39;s inside");
    expect(html).toContain('101 fixes, step by step');
  });

  // The page must render from a static host with no network at all.
  it('fetches nothing from the network', () => {
    const html = render(model({ products: [product({ coverDataUri: 'data:image/png;base64,AQID' })] }));
    // Inline scripts are fine — a fetched one is not.
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/src="https?:/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    // The only external reference allowed is the buy button.
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.every((h) => h === 'https://payhip.com/b/AbC9')).toBe(true);
  });

  it('puts the checkout URL on every CTA, byte for byte', () => {
    const url = 'https://payhip.com/b/AbC9?ref=a&b=1';
    const html = render(model({ products: [product({ checkoutUrl: url })] }));
    // &amp; in the attribute is the correct HTML encoding of the same URL.
    const occurrences = html.split('href="https://payhip.com/b/AbC9?ref=a&amp;b=1"').length - 1;
    expect(occurrences).toBe(4); // sticky bar, hero, product card, closing
    // The stylesheet always defines the disabled state; no button is IN it.
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

    const noAnchor = render(model({ products: [product({ compareAtCents: 2000 })] }));
    expect(noAnchor).not.toContain('<span class="price-was">');

    const cents = render(model({ products: [product({ priceCents: 4750, compareAtCents: null })] }));
    expect(cents).toContain('$47.50');

    const eur = render(model({ currency: 'EUR' }));
    expect(eur).toContain('€47');
  });

  it('omits the price and shows no total when none is set', () => {
    const html = render(model({ products: [product({ priceCents: null, compareAtCents: null })] }));
    expect(html).not.toContain('<span class="price">');
    expect(html).toContain('Get the manual</a>');
  });

  it('omits sections it has no content for', () => {
    const html = render(
      model({
        copy: { ...copy, painPoints: [], faqs: [], whoIsItFor: [] },
        guaranteeDays: 0,
      }),
    );
    expect(html).not.toContain('What it&#39;s costing you');
    expect(html).not.toContain('<details>');
    expect(html).not.toContain('money-back guarantee');
  });

  // Inventing reviews would be a false statement about real people, so the
  // section exists only when real quotes are supplied.
  it('renders testimonials only when real ones are supplied', () => {
    expect(render(model())).not.toContain('What readers say');
    const withQuotes = render(model({ testimonials: [{ quote: 'It paid for itself.', author: 'Dana, TX' }] }));
    expect(withQuotes).toContain('What readers say');
    expect(withQuotes).toContain('It paid for itself.');
  });

  it('supports several products with one featured', () => {
    const html = render(
      model({
        products: [product({ title: 'Book One' }), product({ title: 'Bundle', featured: true })],
      }),
    );
    expect(html).toContain('Choose your level');
    expect(html).toContain('Most popular');
    expect(html).toContain('class="cards stagger multi"');
  });

  it('drives its colours from the palette', () => {
    const palette = Palette.fromSeed({ r: 200, g: 20, b: 24 });
    const html = render(model({ palette }));
    expect(html).toContain(`--accent: ${palette.toJSON().accent}`);
    expect(html).toContain(`--bg: ${palette.toJSON().background}`);
  });

  // The page has to have rhythm, not one flat field — that was the whole point
  // of the band tones.
  it('alternates deep, tinted and plain grounds', () => {
    const html = render(model());
    expect(html).toContain('class="hero band-deep"');
    expect((html.match(/band-deep/g) ?? []).length).toBeGreaterThanOrEqual(3); // hero, compare, close
    expect(html).toContain('band-tint');
    expect(html).toContain('band-plain');
  });

  it('renders the without/with comparison', () => {
    const html = render(model());
    expect(html).toContain('Without it');
    expect(html).toContain('With it');
    expect(html).toContain('You pay the shop rate for a ten-minute job.');
    expect(html).toContain('You do the ten-minute job yourself.');
  });

  it('drops the comparison when either side is missing', () => {
    const html = render(model({ copy: { ...copy, comparisonWith: [] } }));
    // The stylesheet always defines these classes; nothing is rendered IN them.
    expect(html).not.toContain('<div class="compare-col');
  });

  it('renders the stat row, and hides it rather than showing a lone stat', () => {
    expect(render(model())).toContain('class="stat-value"');
    expect(render(model({ stats: [] }))).not.toContain('class="stat-value"');
  });

  it('shows the saving outright when the price is discounted', () => {
    expect(render(model())).toContain('Save $30');
    expect(render(model({ products: [product({ compareAtCents: null })] }))).not.toContain('class="save"');
  });

  it('puts a persistent buy button in the sticky bar', () => {
    const html = render(model());
    expect(html).toContain('class="bar"');
    // Hero, sticky bar, product card, closing.
    expect((html.match(/href="https:\/\/payhip\.com\/b\/AbC9"/g) ?? []).length).toBe(4);
  });

  it('prefers card features over the chapter list, and falls back when absent', () => {
    expect(render(model())).toContain('101 fixes, step by step');
    const noFeatures = render(model({ products: [product({ features: [] })] }));
    expect(noFeatures).toContain('Reading the dashboard');
  });

  it('adapts when no hero or author photo is supplied', () => {
    const bare = render(model());
    expect(bare).not.toContain('<div class="hero-photo"');
    expect(bare).not.toContain('<img class="author-photo"');
    expect(bare).not.toContain('has-photo"');

    const withPhotos = render(
      model({ heroImageDataUri: 'data:image/jpeg;base64,AA', authorPhotoDataUri: 'data:image/jpeg;base64,BB' }),
    );
    expect(withPhotos).toContain('hero-photo');
    expect(withPhotos).toContain('has-photo"');
  });

  it('shows the author credential only when there is one', () => {
    expect(render(model())).toContain('Adrian · Car Care Garage');
    expect(render(model({ authorCredential: null }))).not.toContain('class="credential"');
  });

  describe('scroll animation', () => {
    it('marks the blocks that reveal on scroll', () => {
      const html = render(model());
      expect(html).toContain('class="bullets stagger"');
      expect(html).toContain('class="pains stagger"');
      expect(html).toContain('class="compare stagger"');
      expect(html).toContain('class="guarantee reveal"');
      expect(html).toContain('IntersectionObserver');
    });

    it('reveals each block once and stops watching it', () => {
      const html = render(model());
      // Without unobserve, scrolling back up would re-trigger the animation.
      expect(html).toContain('io.unobserve');
    });

    // The one that actually matters. If the hidden start state applied without
    // JavaScript, a blocked or broken script would leave the whole page blank —
    // a dead sales page nobody notices until a customer reports it.
    it('only ever hides content under the JS-set .anim class', () => {
      const html = render(model());
      // Keyframes are excluded: they describe an animation's midpoints, and an
      // animation that never runs never applies them.
      const css = html
        .slice(html.indexOf('<style>'), html.indexOf('</style>'))
        .replace(/@keyframes[\s\S]*?\{[\s\S]*?\}\s*\}/g, '');

      for (const rule of css.split('}')) {
        if (!/opacity:\s*0[;\s]|visibility:\s*hidden/.test(rule)) continue;
        const selector = rule.split('{')[0] ?? '';
        // .cta[aria-disabled] uses opacity for the inert button, which is fine.
        if (selector.includes('aria-disabled')) continue;
        expect(selector).toContain('.anim');
      }
    });

    it('un-hides the page if the observer never starts', () => {
      const html = render(model());
      // Belt and braces: the arming script drops .anim again unless the
      // observer marks itself ready.
      expect(html).toContain("data-anim") ;
      expect(html).toContain("replace(' anim', '')");
    });

    it('skips reveals entirely for readers who prefer reduced motion', () => {
      const html = render(model());
      // The class is never added, so nothing is ever hidden to begin with.
      expect(html).toContain("matchMedia('(prefers-reduced-motion: reduce)').matches");
      expect(html.slice(html.indexOf('<style>'), html.indexOf('</style>'))).toContain(
        '@media (prefers-reduced-motion: reduce)',
      );
    });

    it('carries no inline event handlers', () => {
      // Scripts are ours and static; model prose never reaches one.
      expect(render(model())).not.toMatch(/\s\bon(click|load|error|mouse\w+)\s*=/i);
    });
  });

  it('switches typeface on the copy’s own judgement', () => {
    expect(render(model({ copy: { ...copy, fontFamily: 'serif' } }))).toContain('Georgia');
    expect(render(model())).toContain('Helvetica Neue');
  });
});
