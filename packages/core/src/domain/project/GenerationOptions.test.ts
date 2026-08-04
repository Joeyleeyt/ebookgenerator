import { describe, expect, it } from 'vitest';
import { COOKING_RECIPE_COUNT, GenerationOptions, normalizeBookTitle } from './GenerationOptions.js';

describe('normalizeBookTitle', () => {
  it('turns a pasted filename-style title into a readable one', () => {
    expect(normalizeBookTitle('THE_DIY_REPAIR_BIBLE_101_REPAIRS_YOU_CAN_DO_YOURSELF_AND_SAVE_THOUSANDS')).toBe(
      'The DIY Repair Bible 101 Repairs You Can Do Yourself and Save Thousands',
    );
  });

  it('keeps acronyms upper-case when title-casing', () => {
    expect(normalizeBookTitle('THE_DIY_SUV_OWNERS_GUIDE')).toBe('The DIY SUV Owners Guide');
  });

  it('keeps minor words lowercase inside the title but not at the edges', () => {
    expect(normalizeBookTitle('stop paying for ignorance')).toBe('Stop Paying for Ignorance');
    // A minor word must still be capitalized when it leads.
    expect(normalizeBookTitle('THE_ART_OF_REPAIR')).toBe('The Art of Repair');
  });

  it('preserves deliberate mixed case', () => {
    const title = 'iPhone Repair for the DIY Owner';
    expect(normalizeBookTitle(title)).toBe(title);
  });

  it('collapses underscore and whitespace runs', () => {
    expect(normalizeBookTitle('  MESSY___SPACING  ')).toBe('Messy Spacing');
  });

  it('leaves numbers and apostrophes intact', () => {
    expect(normalizeBookTitle("THE_SMART_DRIVER'S_BUYING_BIBLE_101_PRODUCTS")).toBe(
      "The Smart Driver's Buying Bible 101 Products",
    );
  });

  it('returns undefined for empty or missing input', () => {
    expect(normalizeBookTitle(undefined)).toBeUndefined();
    expect(normalizeBookTitle('   ')).toBeUndefined();
    expect(normalizeBookTitle('___')).toBeUndefined();
  });
});

describe('GenerationOptions', () => {
  it('stores the normalized title so every stage sees the clean string', () => {
    const options = GenerationOptions.create({ bookTitle: 'THE_DIY_REPAIR_BIBLE' });
    expect(options.bookTitle).toBe('The DIY Repair Bible');
  });

  it('still reads a recipe count from a filename-style title', () => {
    const options = GenerationOptions.create({ bookType: 'cooking', bookTitle: '101_EASY_WEEKNIGHT_RECIPES' });
    expect(options.recipeCount).toBe(101);
  });

  it('does not mistake a date for a recipe count', () => {
    const options = GenerationOptions.create({ bookType: 'cooking', bookTitle: 'Recipes for the 4th of July' });
    expect(options.recipeCount).toBe(COOKING_RECIPE_COUNT);
  });
});

describe('landing page options', () => {
  // Empty form fields arrive as blank strings, not undefined.
  it('treats a blank checkout link or template URL as unset', () => {
    const opts = GenerationOptions.create({ landingCheckoutUrl: '   ', landingTemplateUrl: '' });
    expect(opts.hasCheckoutUrl).toBe(false);
    expect(opts.landingTemplateUrl).toBeUndefined();
  });

  it('keeps the landing settings through a round trip', () => {
    const original = GenerationOptions.create({
      landingPage: true,
      landingTemplateUrl: 'https://eliasyoder.com',
      landingPriceCents: 2700,
    });
    const restored = GenerationOptions.create(original.toJSON());
    expect(restored.landingTemplateUrl).toBe('https://eliasyoder.com');
    expect(restored.landingPriceCents).toBe(2700);
  });
});
