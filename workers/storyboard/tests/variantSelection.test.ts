import { describe, it, expect } from 'vitest';
import { selectVariants } from '../src/variantSelection';
import type { Storyboard } from '@promptdemo/schema';

function fc(sceneId: number, extra: Partial<{ variant: string }> = {}) {
  return {
    sceneId,
    type: 'FeatureCallout' as const,
    durationInFrames: 120,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
    props: {
      title: 'T', description: 'D', layout: 'leftImage' as const,
      ...extra,
    },
  };
}
function hero() {
  return {
    sceneId: 99,
    type: 'HeroRealShot' as const,
    durationInFrames: 90,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
    props: { title: 'Hi', screenshotKey: 'viewport' as const },
  };
}

const assetsBoth = {
  screenshots: { viewport: 's3://x/v.jpg', fullPage: 's3://x/f.jpg' },
} as unknown as Storyboard['assets'];
const assetsNone = { screenshots: {} } as unknown as Storyboard['assets'];
const assetsViewportOnly = {
  screenshots: { viewport: 's3://x/v.jpg' },
} as unknown as Storyboard['assets'];

describe('selectVariants', () => {
  it('assigns dashboard to every FeatureCallout when no viewport screenshot exists', () => {
    const scenes = [hero(), fc(1), fc(2), fc(3)];
    const result = selectVariants(scenes, assetsNone, 3);
    expect(result[1].props.variant).toBe('dashboard');
    expect(result[2].props.variant).toBe('dashboard');
    expect(result[3].props.variant).toBe('dashboard');
  });

  it('always gives the first FeatureCallout the "image" variant when viewport exists', () => {
    const scenes = [hero(), fc(1), fc(2)];
    const result = selectVariants(scenes, assetsBoth, 2);
    expect(result[1].props.variant).toBe('image');
  });

  it('alternates kenBurns on even-indexed subsequent FeatureCallouts when fullPage exists', () => {
    // indices among FeatureCallouts: 0 (first → image), 1 (odd → collage branch), 2 (even → kenBurns)
    const scenes = [hero(), fc(1), fc(2), fc(3)];
    const result = selectVariants(scenes, assetsBoth, 3);
    expect(result[1].props.variant).toBe('image');      // first FC
    expect(result[2].props.variant).toBe('collage');    // FC index 1 (odd) + featureCount ≥ 3
    expect(result[3].props.variant).toBe('kenBurns');   // FC index 2 (even)
  });

  it('falls back to image when fullPage missing and not first FC', () => {
    const scenes = [hero(), fc(1), fc(2), fc(3)];
    const result = selectVariants(scenes, assetsViewportOnly, 2);
    expect(result[1].props.variant).toBe('image');
    expect(result[2].props.variant).toBe('image');
    expect(result[3].props.variant).toBe('image');
  });

  it('never picks collage when featureCount < 3', () => {
    const scenes = [hero(), fc(1), fc(2), fc(3), fc(4)];
    const result = selectVariants(scenes, assetsBoth, 2);
    // FC indices: 0 image, 1 (odd, featureCount=2 <3) → image, 2 (even) → kenBurns, 3 (odd, count<3) → image
    expect(result[1].props.variant).toBe('image');
    expect(result[2].props.variant).toBe('image');
    expect(result[3].props.variant).toBe('kenBurns');
    expect(result[4].props.variant).toBe('image');
  });

  it('leaves non-FeatureCallout scenes untouched', () => {
    const scenes = [hero(), fc(1)];
    const result = selectVariants(scenes, assetsBoth, 1);
    expect(result[0]).toEqual(scenes[0]);
  });

  it('does not mutate the input array', () => {
    const scenes = [hero(), fc(1)];
    const before = JSON.stringify(scenes);
    selectVariants(scenes, assetsBoth, 1);
    expect(JSON.stringify(scenes)).toBe(before);
  });
});
