import { z } from 'zod';

export const JobInputSchema = z.object({
  url: z.string().url(),
  intent: z.string().min(1).max(500),
  duration: z.union([z.literal(10), z.literal(30), z.literal(60)]),
  parentJobId: z.string().min(1).optional(),
  hint: z.string().min(1).max(500).optional(),
});
export type JobInput = z.infer<typeof JobInputSchema>;

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

const JobStageSchema = z.enum(['crawl', 'storyboard', 'render']).nullable();

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
  jobId: z.string(),
  parentJobId: z.string().optional(),
  status: JobStatusSchema,
  stage: JobStageSchema,
  progress: z.number().int().min(0).max(100),
  input: JobInputSchema,
  crawlResultUri: z.string().startsWith('s3://').optional(),
  storyboardUri: z.string().startsWith('s3://').optional(),
  videoUrl: z.string().startsWith('s3://').optional(),
  fallbacks: z.array(FallbackSchema),
  error: ErrorSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Job = z.infer<typeof JobSchema>;
