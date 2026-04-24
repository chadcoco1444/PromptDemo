import { describe, it, expect } from 'vitest';
import type { Scene, CrawlResult } from '@promptdemo/schema';
import { resolveScene } from '../src/resolveScene.js';
import { deriveTheme } from '../src/utils/brandTheme.js';

const theme = deriveTheme('#4f46e5');
const assets = {
  screenshots: { viewport: 's3://fake/v.jpg', fullPage: 's3://fake/f.jpg' },
} as unknown as Storyboard['assets'];

const resolver = (uri: string | undefined) => uri?.replace('s3://fake/', 'http://fake/');

describe('resolveScene', () => {
  it('returns an element for HeroRealShot', () => {
    const scene: Scene = {
      sceneId: 1,
      type: 'HeroRealShot',
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { title: 'Hi', screenshotKey: 'viewport' },
    };
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
  });

  it('throws for deferred v1.1 scene types', () => {
    const scene = {
      sceneId: 1,
      type: 'BentoGrid',
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] },
    } as unknown as Scene;
    expect(() => resolveScene({ scene, assets, theme, url: 'https://x.com', resolver })).toThrow(/not implemented/i);
  });

  it('resolves a FeatureCallout with variant=image', () => {
    const scene: Scene = {
      sceneId: 2,
      type: 'FeatureCallout',
      durationInFrames: 120,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { title: 'T', description: 'D', layout: 'leftImage', variant: 'image' },
    };
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
  });

  it('resolves a FeatureCallout with variant=kenBurns when fullPage exists', () => {
    const scene: Scene = {
      sceneId: 3,
      type: 'FeatureCallout',
      durationInFrames: 120,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { title: 'T', description: 'D', layout: 'leftImage', variant: 'kenBurns' },
    };
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
  });
});

// Minimal type import so tests are self-contained
import type { Storyboard } from '@promptdemo/schema';
