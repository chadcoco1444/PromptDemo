import { z } from 'zod';
import { S3UriSchema } from '@promptdemo/schema';

export const JobStatusSchema = z.enum([
  'queued',
  'crawling',
  'generating',
  'waiting_render_slot',
  'rendering',
  'done',
  'failed',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

export const JobStageSchema = z.enum(['crawl', 'storyboard', 'render']).nullable();

export const JobInputSchema = z.object({
  url: z.string().url(),
  intent: z.string().min(1).max(500),
  duration: z.union([z.literal(10), z.literal(30), z.literal(60)]),
  parentJobId: z.string().min(1).optional(),
  hint: z.string().min(1).max(500).optional(),
});
export type JobInput = z.infer<typeof JobInputSchema>;

const FallbackSchema = z.object({
  field: z.string(),
  reason: z.string(),
  replacedWith: z.string(),
});

const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

export const JobSchema = z.object({
  jobId: z.string().min(1),
  parentJobId: z.string().min(1).optional(),
  // Only populated when AUTH_ENABLED=true + the trusted apps/web proxy set
  // X-User-Id. Anonymous jobs (pre-auth mode) omit this.
  userId: z.string().min(1).optional(),
  status: JobStatusSchema,
  stage: JobStageSchema,
  progress: z.number().int().min(0).max(100),
  input: JobInputSchema,
  crawlResultUri: S3UriSchema.optional(),
  storyboardUri: S3UriSchema.optional(),
  videoUrl: S3UriSchema.optional(),
  fallbacks: z.array(FallbackSchema),
  error: ErrorSchema.optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type Job = z.infer<typeof JobSchema>;
