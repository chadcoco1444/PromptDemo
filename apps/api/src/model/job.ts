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
  /** When true, forces showWatermark=true regardless of the user's tier. Used
   *  by the dogfood script (--watermark flag) to generate PLG marketing assets
   *  from a Pro account without suppressing the Pill Badge. */
  forceWatermark: z.boolean().optional(),
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
  // Only populated when AUTH_ENABLED=true + the trusted apps/web proxy
  // attaches a signed JWT. Anonymous jobs (pre-auth mode) omit this.
  // Accepts string or number on parse (older entries pre-coercion stored
  // the SERIAL id as a JSON number); always normalized to string.
  userId: z.union([z.string(), z.number()]).transform((v) => String(v)).pipe(z.string().min(1)).optional(),
  status: JobStatusSchema,
  stage: JobStageSchema,
  progress: z.number().int().min(0).max(100),
  input: JobInputSchema,
  crawlResultUri: S3UriSchema.optional(),
  storyboardUri: S3UriSchema.optional(),
  videoUrl: S3UriSchema.optional(),
  thumbUrl: S3UriSchema.optional(),
  fallbacks: z.array(FallbackSchema),
  error: ErrorSchema.optional(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type Job = z.infer<typeof JobSchema>;
