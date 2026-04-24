import { describe, it, expect } from 'vitest';
import { selectVariants } from '../src/variantSelection';
import type { Scene, Storyboard, FeatureVariant } from '@promptdemo/schema';

function fc(sceneId: number, extra: Partial<{ variant: FeatureVariant }> = {}): Scene {
  return {
    sceneId,
    type: 'FeatureCallout',
    durationInFrames: 120,
    entryAnimation: 'fade',
    exitAnimation: 'fade',
    props: {
      title: 'T', description: 'D', layout: 'leftImage',
      variant: extra.variant ?? 'image',
    },
  } as Scene;
}
function hero(): Scene {
  return {
    sceneId: 99,
    type: 'HeroRealShot',
    durationInFrames: 90,
    entryAnimation: 'fade',
    exitAnimation: 'fade',
    props: { title: 'Hi', screenshotKey: 'viewport' },
  } as Scene;
}

function asFC(scene: Scene): Scene & { type: 'FeatureCallout' } {
  if (scene.type !== 'FeatureCallout') throw new Error(`expected FeatureCallout, got ${scene.type}`);
  return scene as Scene & { type: 'FeatureCallout' };
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
    expect(asFC(result[1]!).props.variant).toBe('dashboard');
    expect(asFC(result[2]!).props.variant).toBe('dashboard');
    expect(asFC(result[3]!).props.variant).toBe('dashboard');
  });

  it('always gives the first FeatureCallout the "image" variant when viewport exists', () => {
    const scenes = [hero(), fc(1), fc(2)];
    const result = selectVariants(scenes, assetsBoth, 2);
    expect(asFC(result[1]!).props.variant).toBe('image');
  });

  it('alternates kenBurns on even-indexed subsequent FeatureCallouts when fullPage exists', () => {
    // indices among FeatureCallouts: 0 (first → image), 1 (odd → collage branch), 2 (even → kenBurns)
    const scenes = [hero(), fc(1), fc(2), fc(3)];
    const result = selectVariants(scenes, assetsBoth, 3);
    expect(asFC(result[1]!).props.variant).toBe('image');      // first FC
    expect(asFC(result[2]!).props.variant).toBe('collage');    // FC index 1 (odd) + featureCount ≥ 3
    expect(asFC(result[3]!).props.variant).toBe('kenBurns');   // FC index 2 (even)
  });

  it('falls back to image when fullPage missing and not first FC', () => {
    const scenes = [hero(), fc(1), fc(2), fc(3)];
    const result = selectVariants(scenes, assetsViewportOnly, 2);
    expect(asFC(result[1]!).props.variant).toBe('image');
    expect(asFC(result[2]!).props.variant).toBe('image');
    expect(asFC(result[3]!).props.variant).toBe('image');
  });

  it('never picks collage when featureCount < 3', () => {
    const scenes = [hero(), fc(1), fc(2), fc(3), fc(4)];
    const result = selectVariants(scenes, assetsBoth, 2);
    // FC indices: 0 image, 1 (odd, featureCount=2 <3) → image, 2 (even) → kenBurns, 3 (odd, count<3) → image
    expect(asFC(result[1]!).props.variant).toBe('image');
    expect(asFC(result[2]!).props.variant).toBe('image');
    expect(asFC(result[3]!).props.variant).toBe('kenBurns');
    expect(asFC(result[4]!).props.variant).toBe('image');
  });

  it('leaves non-FeatureCallout scenes untouched', () => {
    const scenes = [hero(), fc(1)];
    const result = selectVariants(scenes, assetsBoth, 1);
    expect(result[0]!).toEqual(scenes[0]!);
  });

  it('does not mutate the input array', () => {
    const scenes = [hero(), fc(1)];
    const before = JSON.stringify(scenes);
    selectVariants(scenes, assetsBoth, 1);
    expect(JSON.stringify(scenes)).toBe(before);
  });
});

describe('generator enrichment integration', () => {
  it('enriches FeatureCallout scenes with variants deterministically across two runs', () => {
    const scenes = [
      { sceneId: 1, type: 'FeatureCallout' as const, durationInFrames: 120,
        entryAnimation: 'fade' as const, exitAnimation: 'fade' as const,
        props: { title: 'A', description: 'a', layout: 'leftImage' as const } },
      { sceneId: 2, type: 'FeatureCallout' as const, durationInFrames: 120,
        entryAnimation: 'fade' as const, exitAnimation: 'fade' as const,
        props: { title: 'B', description: 'b', layout: 'leftImage' as const } },
    ];
    const assets = {
      screenshots: { viewport: 's3://x/v.jpg', fullPage: 's3://x/f.jpg' },
    } as never;
    const run1 = selectVariants(scenes as never, assets, 3);
    const run2 = selectVariants(scenes as never, assets, 3);
    expect(asFC(run1[0]!).props.variant).toBe(asFC(run2[0]!).props.variant);
    expect(asFC(run1[1]!).props.variant).toBe(asFC(run2[1]!).props.variant);
  });
});
