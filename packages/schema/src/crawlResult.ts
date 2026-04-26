import { z } from 'zod';
import { S3UriSchema } from './s3Uri';

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be #RRGGBB hex');

const BrandSchema = z.object({
  primaryColor: HexColorSchema.optional(),
  secondaryColor: HexColorSchema.optional(),
  logoUrl: S3UriSchema.optional(),
  fontFamily: z.string().max(64).optional(),
  fontFamilySupported: z.boolean().optional(),
});

const ScreenshotsSchema = z.object({
  viewport: S3UriSchema.optional(),
  fullPage: S3UriSchema.optional(),
  byFeature: z.record(S3UriSchema).optional(),
});

const FeatureSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  iconHint: z.string().max(100).optional(),
});

const FallbackSchema = z.object({
  field: z.string(),
  reason: z.string(),
  replacedWith: z.string(),
});

export const ReviewSchema = z.object({
  text:   z.string().min(10).max(500),
  author: z.string().max(100).optional(),
  role:   z.string().max(100).optional(),
});

export type ExtractedReview = z.infer<typeof ReviewSchema>;

export const CrawlResultSchema = z.object({
  url: z.string().url(),
  fetchedAt: z.number().int().positive(),
  screenshots: ScreenshotsSchema,
  brand: BrandSchema,
  sourceTexts: z.array(z.string().min(1).max(200)).min(1),
  features: z.array(FeatureSchema),
  reviews: z.array(ReviewSchema).max(10).default([]),
  fallbacks: z.array(FallbackSchema),
  tier: z.enum(['A', 'B', 'C']),
  trackUsed: z.enum(['playwright', 'screenshot-saas', 'cheerio']),
});

export type CrawlResult = z.infer<typeof CrawlResultSchema>;
