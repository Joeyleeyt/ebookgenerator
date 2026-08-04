import { z } from 'zod';

/**
 * Landing-page settings. The checkout URL is intentionally just a URL: the
 * store (Payhip today, anything tomorrow) is never modelled, and the value is
 * written into the page's buttons verbatim.
 *
 * All of these are optional at submit time — the product cannot exist on the
 * store until the book has been generated and uploaded — but a page cannot be
 * published until a checkout URL is set.
 */
const LandingOptionFields = {
  landingPage: z.boolean().default(false),
  landingCheckoutUrl: z.string().url().max(2000).optional().or(z.literal('')),
  landingPriceCents: z.number().int().min(0).max(10_000_00).optional(),
  landingCompareAtCents: z.number().int().min(0).max(10_000_00).optional(),
  landingCurrency: z.string().trim().length(3).default('USD'),
  landingGuaranteeDays: z.number().int().min(0).max(365).default(30),
  /** Reference sales page this book's layout should follow. */
  landingTemplateUrl: z.string().url().max(2000).optional().or(z.literal('')),
};

export const SubmitChannelDto = z.object({
  channelUrl: z.string().url(),
  options: z
    .object({
      /** Required user-provided book title; always used as the book's title. */
      bookTitle: z.string().trim().min(1).max(200),
      bookType: z.enum(['normal', 'cooking']).default('normal'),
      targetPages: z.number().int().min(10).max(200).default(100),
      maxVideos: z.number().int().min(5).max(50).default(30),
      /** Recipe count for cooking books; ignored for normal books. */
      recipeCount: z.number().int().min(10).max(120).default(60),
      tone: z.enum(['educational', 'conversational', 'professional']).default('professional'),
      includeComments: z.boolean().default(true),
      includeIllustrations: z.boolean().default(true),
      illustrationEveryPages: z.number().int().min(2).max(50).default(5),
      ...LandingOptionFields,
    }),
});

export type SubmitChannelDto = z.infer<typeof SubmitChannelDto>;

/** The landing-page settings, shared by the submit DTO and the later PATCH. */
export const LandingSettingsDto = z.object(LandingOptionFields).partial();
export type LandingSettingsDto = z.infer<typeof LandingSettingsDto>;
