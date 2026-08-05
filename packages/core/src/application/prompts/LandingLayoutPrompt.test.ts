import { describe, expect, it } from 'vitest';
import { LandingLayoutPrompt } from './LandingLayoutPrompt.js';
import { PLACEHOLDERS } from '../landing/pageContract.js';
import type { LandingCopy } from '../../domain/landing/LandingPage.js';

const copy = {
  eyebrow: 'For weekend mechanics',
  headline: 'Stop paying for repairs you could do yourself',
  subheadline: 'The workshop manual for people who own a car, not a garage.',
  ctaLabel: 'Get the manual',
  painPoints: [],
  whatsInsideHeading: "What's inside",
  bullets: [{ title: 'Read the dashboard', body: 'Know which warnings mean stop now.' }],
  whoIsItForHeading: 'Who this is for',
  whoIsItFor: [],
  authorHeading: 'About the author',
  authorBio: 'Adrian has spent nineteen years under cars.',
  faqs: [],
  categoryLabel: '',
  productFeatures: [],
  comparisonWithout: [],
  comparisonWith: [],
  closingHeading: 'Fix it yourself',
  closingBody: 'One repair pays for the book.',
  fontFamily: 'sans',
} as LandingCopy;

const base = { reference: null, copy, bookTitle: 'The Mechanic Bible', pageCount: 120 };

describe('LandingLayoutPrompt', () => {
  it('tells a one-book page there is exactly one product', () => {
    const { system } = LandingLayoutPrompt.build({ ...base, productCount: 1 });
    expect(system).toContain('THERE IS EXACTLY ONE PRODUCT');
    expect(system).not.toContain(PLACEHOLDERS.offerGrid);
  });

  // The model must never write the buy links on a multi-book page: with four
  // different checkout URLs, pairing them with books is the system's job.
  it('hands a multi-book page the offer grid instead', () => {
    const { system } = LandingLayoutPrompt.build({ ...base, productCount: 3 });
    expect(system).toContain('THIS PAGE SELLS 3 PRODUCTS');
    expect(system).toContain(PLACEHOLDERS.offerGrid);
    expect(system).not.toContain('THERE IS EXACTLY ONE PRODUCT');
  });

  it('sends plain text when there are no screenshots', () => {
    const { user } = LandingLayoutPrompt.build({ ...base, productCount: 1 });
    expect(typeof user).toBe('string');
  });

  it('puts the screenshots ahead of the brief when they exist', () => {
    const { user } = LandingLayoutPrompt.build({
      ...base,
      productCount: 1,
      referenceShots: [
        { mediaType: 'image/png', dataBase64: 'AAA' },
        { mediaType: 'image/png', dataBase64: 'BBB' },
      ],
    });

    expect(Array.isArray(user)).toBe(true);
    const blocks = user as Array<{ type: string }>;
    // A framing line, then both images, then the brief — the model should see
    // what the page looks like before reading what it is made of.
    expect(blocks.map((b) => b.type)).toEqual(['text', 'image', 'image', 'text']);
  });

  it('names the other books without asking the model to render them', () => {
    const { user } = LandingLayoutPrompt.build({
      ...base,
      productCount: 3,
      otherTitles: ['The Buying Bible', 'The DIY Repair Bible'],
    });

    const text = user as string;
    expect(text).toContain('The Buying Bible');
    expect(text).toContain('do NOT write these');
  });
});
