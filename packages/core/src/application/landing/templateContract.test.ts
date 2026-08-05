import { describe, it, expect } from 'vitest';
import { validateTemplate, validateBoundPage } from './templateContract.js';
import type { Finding, PlaceholderEntry, RepeaterEntry } from '../../domain/landing/TemplateManifest.js';
import type { Result } from '../../domain/shared/Result.js';

/** Narrows a rejection so the findings can be inspected. */
function rejected(result: Result<void, Finding[]>): Finding[] {
  if (result.isOk()) throw new Error('expected the template to be rejected, but it passed');
  return result.error;
}

function placeholder(placeholderName: string, overrides: Partial<PlaceholderEntry> = {}): PlaceholderEntry {
  return {
    tplId: 'n1',
    placeholder: placeholderName,
    kind: 'text',
    maxChars: 60,
    originalText: 'original',
    hadInlineMarkup: false,
    ...overrides,
  };
}

/** A template carrying every required token, so a test can remove just one. */
const COMPLETE_HTML =
  '<h1>{{HERO_TITLE}}</h1><p>{{HERO_SUBTITLE}}</p><img src="{{BOOK_COVER}}">' +
  '<a href="{{CHECKOUT_URL}}">{{CTA_TEXT}}</a><span>{{PRICE}}</span>' +
  '<span>{{BRAND_NAME}}</span><footer>{{FOOTER_LEGAL}}</footer>';

function baseInput(overrides: Partial<Parameters<typeof validateTemplate>[0]> = {}) {
  return {
    html: COMPLETE_HTML,
    placeholders: [placeholder('HERO_TITLE')],
    repeaters: [] as RepeaterEntry[],
    sourceHost: 'themechanicbible.com',
    originalCtaCount: 1,
    sectionCount: 6,
    ...overrides,
  };
}

describe('validateTemplate', () => {
  it('passes a template carrying every required token', () => {
    expect(validateTemplate(baseInput()).isOk()).toBe(true);
  });

  it('blocks when a required token was never assigned to a node', () => {
    const result = validateTemplate(baseInput({ html: COMPLETE_HTML.replace('{{PRICE}}', '$27') }));
    expect(rejected(result).map((f: Finding) => f.code)).toContain('MISSING_REQUIRED_PLACEHOLDER');
  });

  // The direct answer to "some CTA buttons are missing": v1 had no minimum CTA
  // count at all, so a template with five buy buttons could become a page with
  // one and nothing would notice.
  it('blocks when the template lost buy buttons during labelling', () => {
    const result = validateTemplate(baseInput({ originalCtaCount: 4 }));
    const finding = rejected(result).find((f: Finding) => f.code === 'CTA_COUNT_CHANGED');
    expect(finding?.message).toContain('4 buy buttons');
  });

  it('blocks a link still pointing at the template owner', () => {
    const result = validateTemplate(
      baseInput({ html: `${COMPLETE_HTML}<a href="https://themechanicbible.com/buy">Buy</a>` }),
    );
    expect(rejected(result).map((f: Finding) => f.code)).toContain('SOURCE_LINK_SURVIVED');
  });

  it('ignores the www prefix when matching the source host', () => {
    const result = validateTemplate(
      baseInput({ html: `${COMPLETE_HTML}<img src="https://www.themechanicbible.com/hero.png">` }),
    );
    expect(rejected(result).map((f: Finding) => f.code)).toContain('SOURCE_LINK_SURVIVED');
  });

  it.each([
    ['<script>x()</script>', 'SCRIPT_SURVIVED'],
    ['<iframe src="x"></iframe>', 'EMBED_SURVIVED'],
    ['<form action="/x"></form>', 'FORM_SURVIVED'],
    ['<div onclick="x()"></div>', 'INLINE_HANDLER'],
  ])('blocks executable content that survived cleaning: %s', (fragment, code) => {
    const result = validateTemplate(baseInput({ html: COMPLETE_HTML + fragment }));
    expect(rejected(result).map((f: Finding) => f.code)).toContain(code);
  });

  it('blocks an app shell that never rendered', () => {
    const result = validateTemplate(baseInput({ sectionCount: 1 }));
    expect(rejected(result).map((f: Finding) => f.code)).toContain('TOO_FEW_SECTIONS');
  });

  it('blocks a token the system has no way to fill', () => {
    const result = validateTemplate(baseInput({ html: `${COMPLETE_HTML}<p>{{MADE_UP}}</p>` }));
    expect(rejected(result).map((f: Finding) => f.code)).toContain('UNKNOWN_TOKEN');
  });

  describe('repeaters', () => {
    const withRepeater = `${COMPLETE_HTML}<div><template data-repeat="BENEFITS"><p>{{BENEFITS.title}}</p></template></div>`;
    const declared: RepeaterEntry = {
      key: 'BENEFITS',
      containerTplId: 'n9',
      itemTplId: 'n10',
      originalCount: 3,
      flexibleCount: false,
      fields: ['title'],
    };

    it('accepts a declared repeater placed in the markup', () => {
      expect(validateTemplate(baseInput({ html: withRepeater, repeaters: [declared] })).isOk()).toBe(true);
    });

    it('blocks a repeater in the markup that is not in the map', () => {
      const result = validateTemplate(baseInput({ html: withRepeater, repeaters: [] }));
      expect(rejected(result).map((f: Finding) => f.code)).toContain('UNDECLARED_REPEATER');
    });

    it('blocks a declared repeater with no <template> in the markup', () => {
      const result = validateTemplate(baseInput({ repeaters: [declared] }));
      expect(rejected(result).map((f: Finding) => f.code)).toContain('REPEATER_NOT_PLACED');
    });
  });
});

describe('validateBoundPage', () => {
  const bound =
    '<h1>Fix It Yourself</h1><img src="assets/cover.webp" alt="cover">' +
    '<a href="https://store.example.com/p/1">Get it</a>';

  it('passes a clean bound page', () => {
    const findings = validateBoundPage({
      html: bound,
      checkoutUrl: 'https://store.example.com/p/1',
      sourceHost: 'themechanicbible.com',
      expectedCtaCount: 1,
    });
    expect(findings.filter((f) => f.severity === 'BLOCKER')).toEqual([]);
  });

  // Every v1 check ran BEFORE substitution, so a page could ship with leaked
  // slot tokens and nothing would catch it.
  it('blocks a token that survived binding', () => {
    const findings = validateBoundPage({
      html: '<h1>{{HERO_TITLE}}</h1>',
      checkoutUrl: null,
      sourceHost: 'x.com',
      expectedCtaCount: 0,
    });
    expect(findings.map((f) => f.code)).toContain('RESIDUAL_TOKEN');
  });

  it('blocks a page whose buttons never got the checkout URL', () => {
    const findings = validateBoundPage({
      html: '<a href="#">Get it</a>',
      checkoutUrl: 'https://store.example.com/p/1',
      sourceHost: 'x.com',
      expectedCtaCount: 1,
    });
    expect(findings.map((f) => f.code)).toContain('CHECKOUT_MISSING');
  });

  it('warns when the checkout link count drifted from the template', () => {
    const findings = validateBoundPage({
      html: bound,
      checkoutUrl: 'https://store.example.com/p/1',
      sourceHost: 'themechanicbible.com',
      expectedCtaCount: 3,
    });
    const drift = findings.find((f) => f.code === 'CHECKOUT_COUNT_DRIFT');
    expect(drift?.severity).toBe('WARN');
  });

  it('blocks an empty href, which reloads the page when clicked', () => {
    const findings = validateBoundPage({
      html: '<a href="">Buy</a>',
      checkoutUrl: null,
      sourceHost: 'x.com',
      expectedCtaCount: 0,
    });
    expect(findings.map((f) => f.code)).toContain('EMPTY_HREF');
  });

  it('warns on accessibility problems without blocking', () => {
    const findings = validateBoundPage({
      html: '<h1>a</h1><h1>b</h1><img src="assets/x.webp">',
      checkoutUrl: null,
      sourceHost: 'x.com',
      expectedCtaCount: 0,
    });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('MULTIPLE_H1');
    expect(codes).toContain('IMG_NO_ALT');
    expect(findings.filter((f) => f.severity === 'BLOCKER')).toEqual([]);
  });
});
