import { describe, it, expect } from 'vitest';
import { bindTemplate, type BindOutcome } from './bindTemplate.js';
import type { Result } from '../../domain/shared/Result.js';

/** Narrows a rejection so the error list can be inspected. */
function rejected(result: Result<BindOutcome, string[]>): string[] {
  if (result.isOk()) throw new Error('expected binding to fail, but it succeeded');
  return result.error;
}

const empty = { scalars: {}, repeats: {} };

describe('bindTemplate', () => {
  it('substitutes a text token', () => {
    const out = bindTemplate('<h1>{{HERO_TITLE}}</h1>', { ...empty, scalars: { HERO_TITLE: 'Fix It Yourself' } });
    expect(out.isOk()).toBe(true);
    expect(out.value.html).toBe('<h1>Fix It Yourself</h1>');
  });

  // The hole v1 had: fillCopySlots wrote model prose into markup unescaped
  // while every other string in the codebase went through esc().
  it('escapes copy so a headline containing markup cannot become markup', () => {
    const out = bindTemplate('<h1>{{HERO_TITLE}}</h1>', {
      ...empty,
      scalars: { HERO_TITLE: 'Brakes & Rotors <script>alert(1)</script>' },
    });
    expect(out.isOk()).toBe(true);
    expect(out.value.html).toBe('<h1>Brakes &amp; Rotors &lt;script&gt;alert(1)&lt;/script&gt;</h1>');
    expect(out.value.html).not.toContain('<script>');
  });

  it('escapes quotes in an attribute context but not in text', () => {
    const attr = bindTemplate('<img src="assets/a.webp" alt="{{BOOK_COVER_ALT}}">', {
      ...empty,
      scalars: { BOOK_COVER_ALT: 'The "Complete" Guide' },
    });
    expect(attr.value.html).toContain('alt="The &quot;Complete&quot; Guide"');

    const text = bindTemplate('<p>{{HERO_SUBTITLE}}</p>', {
      ...empty,
      scalars: { HERO_SUBTITLE: `Don't guess` },
    });
    // An apostrophe is harmless in text and stays readable.
    expect(text.value.html).toBe(`<p>Don't guess</p>`);
  });

  describe('links', () => {
    it('writes the checkout URL verbatim', () => {
      const out = bindTemplate('<a href="{{CHECKOUT_URL}}">Buy</a>', {
        ...empty,
        scalars: { CHECKOUT_URL: 'https://store.example.com/p/abc?ref=x' },
      });
      expect(out.value.html).toBe('<a href="https://store.example.com/p/abc?ref=x">Buy</a>');
    });

    it('refuses a non-https checkout URL', () => {
      const out = bindTemplate('<a href="{{CHECKOUT_URL}}">Buy</a>', {
        ...empty,
        scalars: { CHECKOUT_URL: 'javascript:alert(1)' },
      });
      expect(rejected(out).join(' ')).toContain('must be an https URL');
    });

    // An unresolved href would otherwise render href="", which reloads the page.
    it('renders an unfilled link inert rather than empty', () => {
      const out = bindTemplate('<a href="{{CHECKOUT_URL}}">Buy</a>', empty);
      expect(out.value.html).toBe('<a href="#">Buy</a>');
      expect(out.value.unresolved).toContain('CHECKOUT_URL');
    });
  });

  describe('images', () => {
    it('refuses a remote src so a published page cannot hotlink the template', () => {
      const out = bindTemplate('<img src="{{BOOK_COVER}}">', {
        ...empty,
        scalars: { BOOK_COVER: 'https://themechanicbible.com/cover.png' },
      });
      expect(rejected(out).join(' ')).toContain('local asset path');
    });

    it('accepts a local asset path', () => {
      const out = bindTemplate('<img src="{{BOOK_COVER}}">', {
        ...empty,
        scalars: { BOOK_COVER: 'assets/cover.webp' },
      });
      expect(out.value.html).toBe('<img src="assets/cover.webp">');
    });

    it('removes an optional image that has no value', () => {
      const out = bindTemplate('<div><img src="{{AUTHOR_IMAGE}}" data-optional="AUTHOR_IMAGE"></div>', empty);
      expect(out.value.html).toBe('<div></div>');
      expect(out.value.removedOptional).toContain('AUTHOR_IMAGE');
    });
  });

  describe('html slots', () => {
    // An `html` token writes unescaped markup, so routing model prose into one
    // must take a deliberate act rather than a typo in a key name.
    it('reads only from trustedHtml, never from scalars', () => {
      const out = bindTemplate('<footer>{{FOOTER_LEGAL}}</footer>', {
        ...empty,
        scalars: { FOOTER_LEGAL: '<script>alert(1)</script>' },
      });
      expect(out.value.html).toBe('<footer></footer>');
    });

    it('writes trusted markup unescaped', () => {
      const out = bindTemplate('<footer>{{FOOTER_LEGAL}}</footer>', {
        ...empty,
        trustedHtml: { FOOTER_LEGAL: '<p>© 2026</p>' },
      });
      expect(out.value.html).toBe('<footer><p>© 2026</p></footer>');
    });
  });

  describe('repeaters', () => {
    const template =
      '<div class="cards"><template data-repeat="BENEFITS">' +
      '<div class="card"><h3>{{BENEFITS.title}}</h3><p>{{BENEFITS.body}}</p></div>' +
      '</template></div>';

    it('clones the item once per entry, keeping the item markup identical', () => {
      const out = bindTemplate(template, {
        ...empty,
        repeats: {
          BENEFITS: [
            { title: 'Save money', body: 'Do it yourself' },
            { title: 'Save time', body: 'No booking' },
          ],
        },
      });
      expect(out.value.html).toBe(
        '<div class="cards">' +
          '<div class="card"><h3>Save money</h3><p>Do it yourself</p></div>' +
          '<div class="card"><h3>Save time</h3><p>No booking</p></div>' +
          '</div>',
      );
    });

    it('escapes each field by its own kind', () => {
      const out = bindTemplate(template, {
        ...empty,
        repeats: { BENEFITS: [{ title: 'A & B', body: '<em>x</em>' }] },
      });
      expect(out.value.html).toContain('<h3>A &amp; B</h3>');
      expect(out.value.html).toContain('<p>&lt;em&gt;x&lt;/em&gt;</p>');
    });

    it('removes the region entirely when there is no content for it', () => {
      const out = bindTemplate(template, empty);
      expect(out.value.html).toBe('<div class="cards"></div>');
      expect(out.value.unresolved).toContain('BENEFITS');
    });
  });

  it('strips extraction scaffolding so it never reaches a buyer', () => {
    const out = bindTemplate('<h1 data-tpl="n4" class="x">{{HERO_TITLE}}</h1>', {
      ...empty,
      scalars: { HERO_TITLE: 'Hi' },
    });
    expect(out.value.html).toBe('<h1 class="x">Hi</h1>');
  });

  it('fails on an unknown token rather than shipping literal braces', () => {
    const out = bindTemplate('<p>{{NOT_A_REAL_TOKEN}}</p>', empty);
    expect(rejected(out).join(' ')).toContain('Unknown token');
  });

  it('reports a required token that was not supplied', () => {
    const out = bindTemplate('<h1>{{HERO_TITLE}}</h1>', empty, { required: ['HERO_TITLE'] });
    expect(rejected(out).join(' ')).toContain('{{HERO_TITLE}} is required');
  });
});
