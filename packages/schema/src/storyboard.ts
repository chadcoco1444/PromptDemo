import { z } from 'zod';
import { S3UriSchema } from './s3Uri.js';

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

const VideoConfigSchema = z.object({
  durationInFrames: z.number().int().positive(),
  fps: z.literal(30),
  brandColor: HexColorSchema,
  logoUrl: S3UriSchema.optional(),
  bgm: BgmEnum,
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
  sceneId: z.number().int().positive(),
  durationInFrames: z.number().int().positive(),
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

const FeatureCalloutSchema = z.object({
  ...sceneBase,
  type: z.literal('FeatureCallout'),
  props: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    layout: z.enum(['leftImage', 'rightImage', 'topDown']),
    iconHint: z.string().optional(),
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
