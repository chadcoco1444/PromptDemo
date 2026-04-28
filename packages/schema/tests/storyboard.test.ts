import { describe, it, expect } from 'vitest';
import { StoryboardSchema, SceneSchema, SCENE_TYPES } from '../src/storyboard.js';

const minimalValid = {
  videoConfig: {
    durationInFrames: 900,
    fps: 30 as const,
    brandColor: '#ff5500',
    bgm: 'upbeat' as const,
  },
  assets: {
    screenshots: {},
    sourceTexts: ['hello'],
  },
  scenes: [
    {
      sceneId: 1,
      type: 'TextPunch' as const,
      durationInFrames: 900,
      entryAnimation: 'fade' as const,
      exitAnimation: 'fade' as const,
      props: { text: 'hello', emphasis: 'primary' as const },
    },
  ],
};

describe('StoryboardSchema', () => {
  it('accepts minimal valid storyboard', () => {
    const parsed = StoryboardSchema.parse(minimalValid);
    expect(parsed.scenes.length).toBe(1);
  });

  it('rejects fps other than 30', () => {
    expect(() =>
      StoryboardSchema.parse({
        ...minimalValid,
        videoConfig: { ...minimalValid.videoConfig, fps: 24 },
      })
    ).toThrow();
  });

  it('rejects scenes whose durations do not sum to videoConfig.durationInFrames', () => {
    expect(() =>
      StoryboardSchema.parse({
        ...minimalValid,
        scenes: [{ ...minimalValid.scenes[0]!, durationInFrames: 800 }],
      })
    ).toThrow(/duration/i);
  });

  it('accepts all 10 scene types structurally', () => {
    const types = [
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
    for (const t of types) {
      expect(() =>
        StoryboardSchema.parse({
          ...minimalValid,
          scenes: [makeScene(t)],
        })
      ).not.toThrow();
    }
  });

  it('rejects unknown scene type', () => {
    expect(() =>
      StoryboardSchema.parse({
        ...minimalValid,
        scenes: [{ ...minimalValid.scenes[0]!, type: 'UnknownType' }],
      })
    ).toThrow();
  });

  it('requires entryAnimation and exitAnimation on every scene', () => {
    const bad = { ...minimalValid.scenes[0]! };
    // @ts-expect-error deliberately omitted
    delete bad.entryAnimation;
    expect(() => StoryboardSchema.parse({ ...minimalValid, scenes: [bad] })).toThrow();
  });

  it('accepts bgm value "none"', () => {
    const parsed = StoryboardSchema.parse({
      ...minimalValid,
      videoConfig: { ...minimalValid.videoConfig, bgm: 'none' },
    });
    expect(parsed.videoConfig.bgm).toBe('none');
  });

  it('coerces string sceneId / durationInFrames to number (Claude stringification)', () => {
    // Claude occasionally emits integer fields as strings: { sceneId: "1" }.
    // z.coerce.number() accepts both shapes and normalizes to number.
    const parsed = StoryboardSchema.parse({
      videoConfig: { durationInFrames: '300', fps: 30, brandColor: '#4f46e5', bgm: 'none' },
      assets: { screenshots: {}, sourceTexts: ['hello'] },
      scenes: [
        {
          sceneId: '1',
          type: 'TextPunch',
          durationInFrames: '300',
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: { text: 'hello', emphasis: 'primary' },
        },
      ],
    });
    expect(parsed.videoConfig.durationInFrames).toBe(300);
    expect(parsed.scenes[0]!.sceneId).toBe(1);
    expect(parsed.scenes[0]!.durationInFrames).toBe(300);
    expect(typeof parsed.scenes[0]!.sceneId).toBe('number');
  });
});

describe('FeatureCalloutSchema variant', () => {
  it('defaults variant to "image" when field absent (v1 backward compat)', () => {
    const parsed = SceneSchema.parse({
      sceneId: 1,
      type: 'FeatureCallout',
      durationInFrames: 120,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { title: 'T', description: 'D', layout: 'leftImage' },
    });
    if (parsed.type !== 'FeatureCallout') throw new Error('narrow failed');
    expect(parsed.props.variant).toBe('image');
  });

  it('accepts the four v2.0 variants', () => {
    for (const variant of ['image', 'kenBurns', 'collage', 'dashboard'] as const) {
      const parsed = SceneSchema.parse({
        sceneId: 1,
        type: 'FeatureCallout',
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { title: 'T', description: 'D', layout: 'leftImage', variant },
      });
      if (parsed.type !== 'FeatureCallout') throw new Error('narrow failed');
      expect(parsed.props.variant).toBe(variant);
    }
  });

  it('rejects variant "bento" in v2.0 (deferred to v2.1)', () => {
    expect(() =>
      SceneSchema.parse({
        sceneId: 1,
        type: 'FeatureCallout',
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { title: 'T', description: 'D', layout: 'leftImage', variant: 'bento' },
      })
    ).toThrow();
  });

  it('accepts imageRegion with yOffset and zoom in bounds', () => {
    const parsed = SceneSchema.parse({
      sceneId: 1,
      type: 'FeatureCallout',
      durationInFrames: 120,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        title: 'T',
        description: 'D',
        layout: 'leftImage',
        variant: 'kenBurns',
        imageRegion: { yOffset: 0.3, zoom: 1.2 },
      },
    });
    if (parsed.type !== 'FeatureCallout') throw new Error('narrow failed');
    expect(parsed.props.imageRegion).toEqual({ yOffset: 0.3, zoom: 1.2 });
  });

  it('rejects imageRegion.zoom outside [1, 2]', () => {
    expect(() =>
      SceneSchema.parse({
        sceneId: 1,
        type: 'FeatureCallout',
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: {
          title: 'T',
          description: 'D',
          layout: 'leftImage',
          imageRegion: { yOffset: 0.5, zoom: 2.5 },
        },
      })
    ).toThrow();
  });

  it('accepts imageRegion at inclusive min boundary (yOffset=0, zoom=1)', () => {
    const parsed = SceneSchema.parse({
      sceneId: 1,
      type: 'FeatureCallout',
      durationInFrames: 120,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        title: 'T',
        description: 'D',
        layout: 'leftImage',
        imageRegion: { yOffset: 0, zoom: 1 },
      },
    });
    if (parsed.type !== 'FeatureCallout') throw new Error('narrow failed');
    expect(parsed.props.imageRegion).toEqual({ yOffset: 0, zoom: 1 });
  });

  it('rejects imageRegion.yOffset outside [0, 1]', () => {
    expect(() =>
      SceneSchema.parse({
        sceneId: 1,
        type: 'FeatureCallout',
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: {
          title: 'T',
          description: 'D',
          layout: 'leftImage',
          imageRegion: { yOffset: 1.1, zoom: 1.2 },
        },
      })
    ).toThrow();
  });

  it('rejects imageRegion.zoom below 1', () => {
    expect(() =>
      SceneSchema.parse({
        sceneId: 1,
        type: 'FeatureCallout',
        durationInFrames: 120,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: {
          title: 'T',
          description: 'D',
          layout: 'leftImage',
          imageRegion: { yOffset: 0.5, zoom: 0.5 },
        },
      })
    ).toThrow();
  });
});

describe('TextPunch variant field (v1.7)', () => {
  it('accepts variant: "default" explicitly', () => {
    const result = SceneSchema.safeParse({
      type: 'TextPunch',
      sceneId: 1,
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { text: 'Ship faster.', emphasis: 'primary', variant: 'default' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts variant: "photoBackdrop"', () => {
    const result = SceneSchema.safeParse({
      type: 'TextPunch',
      sceneId: 1,
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { text: 'Ship faster.', emphasis: 'primary', variant: 'photoBackdrop' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts variant: "slideBlock"', () => {
    const result = SceneSchema.safeParse({
      type: 'TextPunch',
      sceneId: 1,
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { text: 'Ship faster.', emphasis: 'primary', variant: 'slideBlock' },
    });
    expect(result.success).toBe(true);
  });

  it('defaults variant to "default" when omitted (backward-compat)', () => {
    const result = SceneSchema.safeParse({
      type: 'TextPunch',
      sceneId: 1,
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { text: 'Ship faster.', emphasis: 'primary' },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'TextPunch') {
      expect(result.data.props.variant).toBe('default');
    }
  });

  it('rejects unknown variant value', () => {
    const result = SceneSchema.safeParse({
      type: 'TextPunch',
      sceneId: 1,
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { text: 'Ship faster.', emphasis: 'primary', variant: 'tilted' },
    });
    expect(result.success).toBe(false);
  });
});

describe('QuoteHero scene (v1.7)', () => {
  const validQuoteHero = {
    type: 'QuoteHero' as const,
    sceneId: 2,
    durationInFrames: 180,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
    props: {
      quote: 'We replaced 3 days of Figma with one paste-and-wait.',
      author: 'Sarah Chen',
      attribution: 'Founder, Acme Inc.',
    },
  };

  it('accepts a minimal QuoteHero (no attribution, no backgroundHint)', () => {
    const result = SceneSchema.safeParse({
      ...validQuoteHero,
      props: { quote: validQuoteHero.props.quote, author: validQuoteHero.props.author },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a full QuoteHero with attribution + backgroundHint', () => {
    const result = SceneSchema.safeParse({
      ...validQuoteHero,
      props: { ...validQuoteHero.props, backgroundHint: 'screenshot' },
    });
    expect(result.success).toBe(true);
  });

  it('defaults backgroundHint to "gradient" when omitted', () => {
    const result = SceneSchema.safeParse(validQuoteHero);
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'QuoteHero') {
      expect(result.data.props.backgroundHint).toBe('gradient');
    }
  });

  it('rejects quote shorter than 10 characters', () => {
    const result = SceneSchema.safeParse({
      ...validQuoteHero,
      props: { ...validQuoteHero.props, quote: 'tiny' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects quote longer than 280 characters', () => {
    const result = SceneSchema.safeParse({
      ...validQuoteHero,
      props: { ...validQuoteHero.props, quote: 'x'.repeat(281) },
    });
    expect(result.success).toBe(false);
  });

  it('SCENE_TYPES array includes "QuoteHero"', () => {
    expect(SCENE_TYPES).toContain('QuoteHero');
  });
});

describe('VideoConfigSchema — showWatermark', () => {
  it('parses a storyboard without showWatermark field and defaults to false', () => {
    // Existing S3 storyboards have no showWatermark — must parse without error
    const parsed = StoryboardSchema.parse(minimalValid);
    expect(parsed.videoConfig.showWatermark).toBe(false);
  });

  it('parses a storyboard with showWatermark: true', () => {
    const parsed = StoryboardSchema.parse({
      ...minimalValid,
      videoConfig: { ...minimalValid.videoConfig, showWatermark: true },
    });
    expect(parsed.videoConfig.showWatermark).toBe(true);
  });

  it('parses a storyboard with showWatermark: false', () => {
    const parsed = StoryboardSchema.parse({
      ...minimalValid,
      videoConfig: { ...minimalValid.videoConfig, showWatermark: false },
    });
    expect(parsed.videoConfig.showWatermark).toBe(false);
  });
});

describe('LogoCloudSchema', () => {
  const logoBase = {
    sceneId: 1,
    type: 'LogoCloud' as const,
    durationInFrames: 300,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
    props: {
      logos: [
        { name: 'Stripe', s3Uri: 's3://bucket/logo-partner-0.svg' },
        { name: 'Vercel', s3Uri: 's3://bucket/logo-partner-1.png' },
      ],
      speed: 'medium' as const,
    },
  };

  it('accepts valid LogoCloud with 2 logos', () => {
    const parsed = SceneSchema.parse(logoBase);
    expect(parsed.type).toBe('LogoCloud');
    if (parsed.type !== 'LogoCloud') throw new Error('narrow');
    expect(parsed.props.logos).toHaveLength(2);
    expect(parsed.props.speed).toBe('medium');
  });

  it('defaults speed to medium when omitted', () => {
    const parsed = SceneSchema.parse({ ...logoBase, props: { logos: logoBase.props.logos } });
    if (parsed.type !== 'LogoCloud') throw new Error('narrow');
    expect(parsed.props.speed).toBe('medium');
  });

  it('rejects fewer than 2 logos', () => {
    expect(() =>
      SceneSchema.parse({
        ...logoBase,
        props: { logos: [{ name: 'Stripe', s3Uri: 's3://bucket/a.svg' }] },
      })
    ).toThrow();
  });

  it('rejects plain HTTP URL in logos s3Uri', () => {
    expect(() =>
      SceneSchema.parse({
        ...logoBase,
        props: {
          logos: [
            { name: 'Stripe', s3Uri: 'https://cdn.stripe.com/logo.svg' },
            { name: 'Vercel', s3Uri: 's3://bucket/b.png' },
          ],
        },
      })
    ).toThrow();
  });
});

describe('CodeToUISchema', () => {
  const codeBase = {
    sceneId: 2,
    type: 'CodeToUI' as const,
    durationInFrames: 300,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
    props: {
      code: 'const client = new LumeSpec();\nclient.generate({ url });',
      language: 'javascript',
      screenshotKey: 'viewport' as const,
    },
  };

  it('accepts valid CodeToUI', () => {
    const parsed = SceneSchema.parse(codeBase);
    expect(parsed.type).toBe('CodeToUI');
    if (parsed.type !== 'CodeToUI') throw new Error('narrow');
    expect(parsed.props.code).toContain('LumeSpec');
    expect(parsed.props.screenshotKey).toBe('viewport');
  });

  it('defaults screenshotKey to viewport', () => {
    const parsed = SceneSchema.parse({ ...codeBase, props: { code: codeBase.props.code } });
    if (parsed.type !== 'CodeToUI') throw new Error('narrow');
    expect(parsed.props.screenshotKey).toBe('viewport');
  });

  it('rejects code shorter than 10 characters', () => {
    expect(() =>
      SceneSchema.parse({ ...codeBase, props: { ...codeBase.props, code: 'short' } })
    ).toThrow();
  });

  it('rejects code longer than 800 characters', () => {
    expect(() =>
      SceneSchema.parse({ ...codeBase, props: { ...codeBase.props, code: 'x'.repeat(801) } })
    ).toThrow();
  });
});

describe('DeviceMockupSchema (via SceneSchema)', () => {
  const validBase = {
    sceneId: 1,
    type: 'DeviceMockup' as const,
    durationInFrames: 150,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
  };
  const validProps = {
    headline: 'Ship demos in seconds',
    subtitle: 'Paste a URL, hit enter.',
    screenshotKey: 'viewport' as const,
    device: 'laptop' as const,
    motion: 'pushIn' as const,
  };

  it('accepts a valid DeviceMockup scene', () => {
    const parsed = SceneSchema.parse({ ...validBase, props: validProps });
    expect(parsed.type).toBe('DeviceMockup');
  });

  it('accepts a valid DeviceMockup with motion=pullOut and device=phone (schema-reserved)', () => {
    const parsed = SceneSchema.parse({
      ...validBase,
      props: { ...validProps, motion: 'pullOut', device: 'phone' },
    });
    expect(parsed.type).toBe('DeviceMockup');
  });

  it('rejects DeviceMockup with motion="lidOpen"', () => {
    expect(() =>
      SceneSchema.parse({ ...validBase, props: { ...validProps, motion: 'lidOpen' } }),
    ).toThrow();
  });

  it('rejects DeviceMockup with screenshotKey="fullPage"', () => {
    expect(() =>
      SceneSchema.parse({ ...validBase, props: { ...validProps, screenshotKey: 'fullPage' } }),
    ).toThrow();
  });

  it('rejects DeviceMockup without headline', () => {
    const { headline, ...withoutHeadline } = validProps;
    expect(() =>
      SceneSchema.parse({ ...validBase, props: withoutHeadline as typeof validProps }),
    ).toThrow();
  });
});

// helper: fabricate a minimal scene of any type that fills duration 900
function makeScene(type: string) {
  const base = {
    sceneId: 1,
    durationInFrames: 900,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
  };
  const propsByType: Record<string, object> = {
    HeroRealShot: { title: 'hi', subtitle: 'there', screenshotKey: 'viewport' },
    HeroStylized: { title: 'hi', subtitle: 'there' },
    FeatureCallout: { title: 'f', description: 'd', layout: 'leftImage' },
    CursorDemo: { action: 'Click', targetHint: { region: 'center' }, targetDescription: 'btn' },
    SmoothScroll: { screenshotKey: 'fullPage', speed: 'medium' },
    UseCaseStory: { beats: [{ label: 'before', text: 'x' }, { label: 'action', text: 'y' }, { label: 'after', text: 'z' }] },
    StatsBand: { stats: [{ value: '100', label: 'users' }] },
    BentoGrid: { items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] },
    TextPunch: { text: 'hi', emphasis: 'primary' },
    CTA: { headline: 'Visit', url: 'https://x.com' },
    LogoCloud: {
      logos: [
        { name: 'Stripe', s3Uri: 's3://bucket/logo-partner-0.svg' },
        { name: 'Vercel', s3Uri: 's3://bucket/logo-partner-1.png' },
      ],
      speed: 'medium',
    },
    CodeToUI: {
      code: 'const x = new LumeSpec();\nx.generate({ url });',
      screenshotKey: 'viewport',
    },
  };
  return { ...base, type, props: propsByType[type]! };
}
