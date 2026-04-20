import { describe, it, expect } from 'vitest';
import { StoryboardSchema } from '../src/storyboard.js';

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
  };
  return { ...base, type, props: propsByType[type]! };
}
