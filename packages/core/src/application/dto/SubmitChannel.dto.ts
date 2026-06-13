import { z } from 'zod';

export const SubmitChannelDto = z.object({
  channelUrl: z.string().url(),
  options: z
    .object({
      targetPages: z.number().int().min(10).max(200).default(100),
      maxVideos: z.number().int().min(5).max(50).default(30),
      tone: z.enum(['educational', 'conversational', 'professional']).default('professional'),
      includeComments: z.boolean().default(true),
      includeIllustrations: z.boolean().default(true),
      illustrationEveryPages: z.number().int().min(2).max(50).default(5),
    })
    .default({}),
});

export type SubmitChannelDto = z.infer<typeof SubmitChannelDto>;
