import { describe, it, expect } from 'vitest';
import { PLACEHOLDERS, fillPlaceholders, validateGeneratedPage, type GeneratedPage } from './pageContract.js';

/** A page that satisfies the contract; each test breaks one thing. */
function page(overrides: Partial<GeneratedPage> = {}): GeneratedPage {
  return {
    css: `
      body { background: var(--bg); color: var(--text); font-family: Georgia, serif; }
      .cta { background: var(--accent); color: var(--accent-contrast); }
      .card { box-shadow: 0 10px 30px rgba(0,0,0,.3); }
    `,
    bodyHtml: `
      <section data-section="hero"><h1>A headline</h1>{{COVER}}{{PRICE}}{{CTA_BUTTON}}</section>
      <section data-section="inside"><h2>Inside</h2>{{CONTENTS}}</section>
      <section data-section="order"><h2>Order</h2>{{PRICE}}{{CTA_BUTTON}}{{GUARANTEE}}{{PAYMENT_MARKS}}</section>
      <section data-section="faq"><h2>Questions</h2><p>Answers.</p></section>
      <footer>{{FOOTER_LEGAL}}</footer>
    `,
    ...overrides,
  };
}

const errorsOf = (p: GeneratedPage) => (validateGeneratedPage(p) as { error?: string[] }).error ?? [];

describe('validateGeneratedPage', () => {
  it('accepts a page that meets the contract', () => {
    expect(validateGeneratedPage(page()).isOk()).toBe(true);
  });

  // Every error goes back to the model in one repair round, so it must report
  // all of them rather than stopping at the first.
  it('reports every problem at once', () => {
    const errors = errorsOf({
      css: 'body { color: #ff0000; }',
      bodyHtml: '<section data-section="hero"><script>x()</script></section>',
    });
    expect(errors.length).toBeGreaterThan(4);
    expect(errors.some((e) => e.includes('Scripts'))).toBe(true);
    expect(errors.some((e) => e.includes('Raw colour'))).toBe(true);
    expect(errors.some((e) => e.includes('{{CTA_BUTTON}}'))).toBe(true);
  });

  describe('placeholders', () => {
    it.each([PLACEHOLDERS.cta, PLACEHOLDERS.price, PLACEHOLDERS.cover, PLACEHOLDERS.legal])(
      'requires %s',
      (token) => {
        const p = page({ bodyHtml: page().bodyHtml.split(token).join('') });
        expect(errorsOf(p).some((e) => e.includes(token))).toBe(true);
      },
    );

    it('allows the CTA and price to repeat', () => {
      expect(validateGeneratedPage(page()).isOk()).toBe(true);
    });

    it('rejects a second legal block', () => {
      const p = page({ bodyHtml: `${page().bodyHtml}<footer>{{FOOTER_LEGAL}}</footer>` });
      expect(errorsOf(p).some((e) => e.includes('exactly once'))).toBe(true);
    });

    // How the model fakes a three-tier offer grid out of one book: repeat the
    // buy button and price into invented "editions".
    it('caps runaway repetition while allowing template-faithful repeats', () => {
      // A template legitimately repeats its buy button and cover several times —
      // production run 1489a338 was rejected for exactly that. Only true spam trips.
      const faithful = page({
        bodyHtml: page().bodyHtml + '{{CTA_BUTTON}}{{CTA_BUTTON}}{{CTA_BUTTON}}{{COVER}}{{COVER}}{{PRICE}}',
      });
      expect(validateGeneratedPage(faithful).isOk()).toBe(true);

      const spam = page({
        bodyHtml: page().bodyHtml + '{{CTA_BUTTON}}'.repeat(5) + '{{COVER}}'.repeat(6) + '{{PRICE}}'.repeat(2),
      });
      const errors = errorsOf(spam);
      expect(errors.some((e) => e.includes('{{CTA_BUTTON}} may appear at most 6'))).toBe(true);
      expect(errors.some((e) => e.includes('{{COVER}} may appear at most 6'))).toBe(true);
      expect(errors.some((e) => e.includes('{{PRICE}} may appear at most 3'))).toBe(true);
    });

    // Copying a template's accent-highlight inside a headline wraps approved
    // words in a span. Production run 1489a338 was rejected for this; the check
    // must see words, not markup.
    it('accepts approved copy wrapped in styling tags', () => {
      const p = page({
        bodyHtml: page().bodyHtml.replace(
          '<h1>A headline</h1>',
          '<h1>A <span class="hl">headline</span></h1>',
        ),
      });
      expect(validateGeneratedPage(p, { requiredText: ['A headline'] }).isOk()).toBe(true);
    });

    it('still rejects changed words', () => {
      const p = page();
      const result = validateGeneratedPage(p, { requiredText: ['A better headline'] });
      expect(result.isFail()).toBe(true);
    });

    // An unrecognised token would reach a buyer as literal braces on the page.
    it('rejects invented placeholders', () => {
      const p = page({ bodyHtml: page().bodyHtml.replace('{{CONTENTS}}', '{{BONUS_STACK}}') });
      expect(errorsOf(p).some((e) => e.includes('{{BONUS_STACK}}'))).toBe(true);
    });
  });

  describe('structure', () => {
    it.each(['hero', 'inside', 'order', 'faq'])('requires the %s section', (name) => {
      const p = page({ bodyHtml: page().bodyHtml.replace(`data-section="${name}"`, 'data-x="y"') });
      expect(errorsOf(p).some((e) => e.includes(name))).toBe(true);
    });

    // Truncated completions are the common failure and show up here first.
    it('catches unbalanced tags from a truncated completion', () => {
      const p = page({ bodyHtml: `${page().bodyHtml}<section data-section="extra"><div><p>cut off` });
      const errors = errorsOf(p);
      expect(errors.some((e) => e.includes('Unbalanced <div>'))).toBe(true);
      expect(errors.some((e) => e.includes('Unbalanced <p>'))).toBe(true);
    });
  });

  describe('executable and external content', () => {
    it.each([
      ['<script>alert(1)</script>', 'Scripts'],
      ['<iframe src="x"></iframe>', 'Embeds'],
      ['<form><input></form>', 'Embeds'],
      ['<div onclick="go()"></div>', 'event handlers'],
      ['<a href="javascript:go()">x</a>', 'javascript:'],
      ['<img src="https://cdn.example.com/a.png">', 'external URLs'],
    ])('rejects %s', (snippet, expected) => {
      const p = page({ bodyHtml: page().bodyHtml + snippet });
      expect(errorsOf(p).some((e) => e.includes(expected))).toBe(true);
    });

    it('rejects remote CSS', () => {
      expect(errorsOf(page({ css: "@import url('https://fonts.example/x.css');" })).length).toBeGreaterThan(0);
      expect(
        errorsOf(page({ css: "body { background: url('https://x.test/bg.png'); }" })).length,
      ).toBeGreaterThan(0);
    });
  });

  describe('colour discipline', () => {
    // The palette is derived from the cover and its contrast is already proven.
    // A raw colour would bypass that guarantee entirely.
    it.each(['#ff0000', 'rgb(255,0,0)', 'hsl(200, 50%, 50%)'])('rejects the raw colour %s', (colour) => {
      const p = page({ css: `${page().css}\n.x { color: ${colour}; }` });
      expect(errorsOf(p).some((e) => e.includes('Raw colour'))).toBe(true);
    });

    it('allows translucent black and white for shadows and scrims', () => {
      const p = page({ css: `${page().css}\n.a{background:rgba(255,255,255,.06)}\n.b{color:rgba(0,0,0,.5)}` });
      expect(validateGeneratedPage(p).isOk()).toBe(true);
    });

    it('rejects a tinted rgba that could wash out text', () => {
      const p = page({ css: `${page().css}\n.a { color: rgba(200, 30, 30, .9); }` });
      expect(errorsOf(p).some((e) => e.includes('Raw colour'))).toBe(true);
    });

    it('rejects unknown variables but allows the model’s own --x- prefix', () => {
      expect(errorsOf(page({ css: '.a { color: var(--brand-blue); }' })).some((e) => e.includes('--brand-blue'))).toBe(
        true,
      );
      const ok = page({ css: `${page().css}\n:root{--x-gap:20px}\n.a{gap:var(--x-gap)}` });
      expect(validateGeneratedPage(ok).isOk()).toBe(true);
    });
  });

  it('rejects a page too large to be one', () => {
    expect(errorsOf(page({ css: 'a{}'.repeat(60_000) })).some((e) => e.includes('CSS is'))).toBe(true);
  });
});

describe('fillPlaceholders', () => {
  it('substitutes every placeholder, including repeats', () => {
    const out = fillPlaceholders(page().bodyHtml, {
      cta: '<a href="https://payhip.com/b/X">Buy</a>',
      price: '<span>$27</span>',
      cover: '<img src="data:image/png;base64,AA">',
      guarantee: '<p>30 days</p>',
      paymentMarks: '<p>Visa</p>',
      testimonials: '',
      contents: '<ul><li>One</li></ul>',
      legal: '<p>Disclaimer</p>',
      logo: '<img src="data:image/png;base64,BB">',
      offerGrid: '<div class="offers"></div>',
      authorPhoto: '<img src="data:image/png;base64,CC">',
    });

    expect(out).not.toMatch(/\{\{[A-Z_]+\}\}/); // nothing left unsubstituted
    expect(out.split('https://payhip.com/b/X').length - 1).toBe(2); // both CTAs
    expect(out).toContain('$27');
  });

  it('drops a placeholder whose content is empty', () => {
    const out = fillPlaceholders('<div>{{TESTIMONIALS}}</div>', {
      cta: '', price: '', cover: '', guarantee: '', paymentMarks: '', testimonials: '', contents: '', legal: '',
      logo: '', offerGrid: '', authorPhoto: '',
    });
    expect(out).toBe('<div></div>');
  });
});
