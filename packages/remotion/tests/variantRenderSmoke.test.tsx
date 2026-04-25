import { describe, it, expect } from 'vitest';
import type { Storyboard } from '@lumespec/schema';
import { StoryboardSchema } from '@lumespec/schema';

describe('variant storyboard validation smoke', () => {
  it('a storyboard with one of each variant parses against v2 schema', () => {
    const sb = {
      videoConfig: {
        durationInFrames: 900,
        fps: 30,
        brandColor: '#4f46e5',
        bgm: 'minimal' as const,
      },
      assets: {
        screenshots: { viewport: 's3://x/v.jpg', fullPage: 's3://x/f.jpg' },
        sourceTexts: ['Hello', 'World', 'Demo'],
      },
      scenes: [
        { sceneId: 1, type: 'HeroRealShot', durationInFrames: 150,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { title: 'Hello', screenshotKey: 'viewport' } },
        { sceneId: 2, type: 'FeatureCallout', durationInFrames: 200,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { title: 'Hello', description: 'World', layout: 'leftImage', variant: 'image' } },
        { sceneId: 3, type: 'FeatureCallout', durationInFrames: 200,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { title: 'Hello', description: 'World', layout: 'rightImage', variant: 'kenBurns' } },
        { sceneId: 4, type: 'FeatureCallout', durationInFrames: 200,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { title: 'Hello', description: 'World', layout: 'topDown', variant: 'collage' } },
        { sceneId: 5, type: 'FeatureCallout', durationInFrames: 150,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { title: 'Hello', description: 'World', layout: 'leftImage', variant: 'dashboard' } },
      ],
    };
    const parsed = StoryboardSchema.parse(sb);
    expect(parsed.scenes).toHaveLength(5);
    const variants = parsed.scenes
      .filter((s): s is Extract<typeof parsed.scenes[number], { type: 'FeatureCallout' }> =>
        s.type === 'FeatureCallout')
      .map((s) => s.props.variant);
    expect(new Set(variants)).toEqual(new Set(['image', 'kenBurns', 'collage', 'dashboard']));
  });
});
