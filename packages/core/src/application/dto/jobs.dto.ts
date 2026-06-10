import { z } from 'zod';

/** Queue payload schemas — validated at the top of every processor (poison-message guard). */

export const ProjectJob = z.object({ projectId: z.string().uuid() });

export const VideoJob = z.object({
  projectId: z.string().uuid(),
  videoId: z.string().uuid(),
  inputHash: z.string().optional(),
});

export const WhisperJob = z.object({
  projectId: z.string().uuid(),
  videoId: z.string().uuid(),
  audioRef: z.string(),
});

export const ChapterResearchJob = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
  inputHash: z.string(),
});

export const ChapterJob = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
  inputHash: z.string(),
  mode: z.enum(['generate', 'regenerate', 'section']).default('generate'),
  instructions: z.string().optional(),
});

/** One per-chapter polishing job, fanned out by the polish-book controller. */
export const PolishChapterJob = z.object({
  projectId: z.string().uuid(),
  chapterId: z.string().uuid(),
});

export const ExportJob = z.object({
  projectId: z.string().uuid(),
  format: z.enum(['pdf', 'docx', 'both']).default('both'),
});

export type ProjectJob = z.infer<typeof ProjectJob>;
export type VideoJob = z.infer<typeof VideoJob>;
export type WhisperJob = z.infer<typeof WhisperJob>;
export type ChapterResearchJob = z.infer<typeof ChapterResearchJob>;
export type ChapterJob = z.infer<typeof ChapterJob>;
export type PolishChapterJob = z.infer<typeof PolishChapterJob>;
export type ExportJob = z.infer<typeof ExportJob>;
