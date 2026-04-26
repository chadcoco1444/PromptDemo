import { z } from 'zod';
import { S3UriSchema } from './s3Uri';

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const AnimationEnum = z.enum([
  'fade',
  'slideLeft',
  'slideRight',
  'slideUp',
  'zoomIn',
  'zoomOut',
  'none',
]);

const BgmEnum = z.enum(['upbeat', 'cinematic', 'minimal', 'tech', 'none']);

// z.coerce.number() accepts both 1 and "1" — Claude occasionally stringifies
// integer fields in JSON output (observed with 10-scene boards). Coercing at
// the schema level is safer than a pre-parse normalize because it handles
// every code path that feeds the schema (generator, fixtures, tests).
const IntPositive = z.coerce.number().int().positive();

const VideoConfigSchema = z.object({
  durationInFrames: IntPositive,
  fps: z.literal(30),
  brandColor: HexColorSchema,
  logoUrl: S3UriSchema.optional(),
  bgm: BgmEnum,
  showWatermark: z.boolean().optional().default(false),
});

const AssetsSchema = z.object({
  screenshots: z.object({
    viewport: S3UriSchema.optional(),
    fullPage: S3UriSchema.optional(),
    byFeature: z.record(S3UriSchema).optional(),
  }),
  sourceTexts: z.array(z.string()).min(1),
});

const sceneBase = {
  sceneId: IntPositive,
  durationInFrames: IntPositive,
  entryAnimation: AnimationEnum,
  exitAnimation: AnimationEnum,
  locked: z.boolean().optional(),
};

const HeroRealShotSchema = z.object({
  ...sceneBase,
  type: z.literal('HeroRealShot'),
  props: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    screenshotKey: z.enum(['viewport', 'fullPage']),
  }),
});

const HeroStylizedSchema = z.object({
  ...sceneBase,
  type: z.literal('HeroStylized'),
  props: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
  }),
});

const FeatureVariantSchema = z.enum(['image', 'kenBurns', 'collage', 'dashboard']);

const ImageRegionSchema = z.object({
  yOffset: z.number().min(0).max(1),
  zoom: z.number().min(1).max(2),
});

const FeatureCalloutSchema = z.object({
  ...sceneBase,
  type: z.literal('FeatureCallout'),
  props: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    layout: z.enum(['leftImage', 'rightImage', 'topDown']),
    iconHint: z.string().optional(),
    variant: FeatureVariantSchema.default('image'),
    imageRegion: ImageRegionSchema.optional(),
  }),
});

const CursorDemoSchema = z.object({
  ...sceneBase,
  type: z.literal('CursorDemo'),
  props: z.object({
    action: z.enum(['Click', 'Scroll', 'Hover', 'Type']),
    targetHint: z.object({
      region: z.enum(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right']),
    }),
    targetDescription: z.string().min(1),
  }),
});

const SmoothScrollSchema = z.object({
  ...sceneBase,
  type: z.literal('SmoothScroll'),
  props: z.object({
    screenshotKey: z.literal('fullPage'),
    speed: z.enum(['slow', 'medium', 'fast']),
  }),
});

const UseCaseStorySchema = z.object({
  ...sceneBase,
  type: z.literal('UseCaseStory'),
  props: z.object({
    beats: z
      .array(z.object({ label: z.enum(['before', 'action', 'after']), text: z.string().min(1) }))
      .length(3),
  }),
});

const StatsBandSchema = z.object({
  ...sceneBase,
  type: z.literal('StatsBand'),
  props: z.object({
    stats: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).min(1).max(4),
  }),
});

const BentoGridSchema = z.object({
  ...sceneBase,
  type: z.literal('BentoGrid'),
  props: z.object({
    items: z
      .array(z.object({ title: z.string().min(1), description: z.string().optional(), iconHint: z.string().optional() }))
      .min(3)
      .max(6),
  }),
});

const TextPunchSchema = z.object({
  ...sceneBase,
  type: z.literal('TextPunch'),
  props: z.object({
    text: z.string().min(1),
    emphasis: z.enum(['primary', 'secondary', 'neutral']),
  }),
});

const CTASchema = z.object({
  ...sceneBase,
  type: z.literal('CTA'),
  props: z.object({
    headline: z.string().min(1),
    url: z.string().url(),
  }),
});

const StatsCounterSchema = z.object({
  ...sceneBase,
  type: z.literal('StatsCounter'),
  props: z.object({
    stats: z
      .array(z.object({ value: z.string().min(1).max(20), label: z.string().min(1).max(80) }))
      .min(1)
      .max(4),
  }),
});

const ReviewMarqueeSchema = z.object({
  ...sceneBase,
  type: z.literal('ReviewMarquee'),
  props: z.object({
    reviews: z
      .array(z.object({ text: z.string().min(10).max(300), author: z.string().max(100).optional() }))
      .min(2)
      .max(6),
    speed: z.enum(['slow', 'medium', 'fast']).default('medium'),
  }),
});

export const SceneSchema = z.discriminatedUnion('type', [
  HeroRealShotSchema,
  HeroStylizedSchema,
  FeatureCalloutSchema,
  CursorDemoSchema,
  SmoothScrollSchema,
  UseCaseStorySchema,
  StatsBandSchema,
  BentoGridSchema,
  TextPunchSchema,
  CTASchema,
  StatsCounterSchema,
  ReviewMarqueeSchema,
]);

export const SCENE_TYPES = [
  'HeroRealShot',
  'HeroStylized',
  'FeatureCallout',
  'CursorDemo',
  'SmoothScroll',
  'UseCaseStory',
  'StatsBand',
  'BentoGrid',
  'TextPunch',
  'CTA',
  'StatsCounter',
  'ReviewMarquee',
] as const;

export const V1_MVP_SCENE_TYPES = ['HeroRealShot', 'FeatureCallout', 'TextPunch', 'SmoothScroll', 'CTA'] as const;

export const StoryboardSchema = z
  .object({
    videoConfig: VideoConfigSchema,
    assets: AssetsSchema,
    scenes: z.array(SceneSchema).min(1),
  })
  .superRefine((sb, ctx) => {
    const sum = sb.scenes.reduce((n, s) => n + s.durationInFrames, 0);
    if (sum !== sb.videoConfig.durationInFrames) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scenes'],
        message: `scenes durationInFrames sum (${sum}) must equal videoConfig.durationInFrames (${sb.videoConfig.durationInFrames})`,
      });
    }
  });

export type Scene = z.infer<typeof SceneSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;

export { FeatureVariantSchema };
export type FeatureVariant = z.infer<typeof FeatureVariantSchema>;
export { ImageRegionSchema };
export type ImageRegion = z.infer<typeof ImageRegionSchema>;
