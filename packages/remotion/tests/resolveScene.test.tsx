import { describe, it, expect } from 'vitest';
import type { Scene, CrawlResult } from '@lumespec/schema';
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

  it.each([
    {
      type: 'HeroStylized' as const,
      sceneId: 10,
      durationInFrames: 90,
      entryAnimation: 'fade' as const,
      exitAnimation: 'fade' as const,
      props: { title: 'Coming soon' },
    },
    {
      type: 'UseCaseStory' as const,
      sceneId: 11,
      durationInFrames: 90,
      entryAnimation: 'fade' as const,
      exitAnimation: 'fade' as const,
      props: {
        beats: [
          { label: 'before' as const, text: 'Before' },
          { label: 'action' as const, text: 'Action' },
          { label: 'after' as const, text: 'After' },
        ],
      },
    },
    {
      type: 'StatsBand' as const,
      sceneId: 12,
      durationInFrames: 90,
      entryAnimation: 'fade' as const,
      exitAnimation: 'fade' as const,
      props: { stats: [{ value: '99%', label: 'uptime' }] },
    },
  ])('returns a TextPunch fallback for deferred scene type $type', (scene) => {
    const el = resolveScene({ scene: scene as unknown as Scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
    expect(el.props.text).toContain(scene.type);
  });

  it('resolves a BentoGrid scene', () => {
    const scene: Scene = {
      sceneId: 4,
      type: 'BentoGrid',
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] },
    };
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
  });

  it('resolves a CursorDemo scene', () => {
    const scene: Scene = {
      sceneId: 5,
      type: 'CursorDemo',
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { action: 'Click', targetHint: { region: 'center' }, targetDescription: 'Submit button' },
    };
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
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

  it('resolves a LogoCloud scene', () => {
    const scene = {
      sceneId: 6,
      type: 'LogoCloud',
      durationInFrames: 300,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        logos: [
          { name: 'Stripe', s3Uri: 's3://fake/stripe.svg' },
          { name: 'Vercel', s3Uri: 's3://fake/vercel.png' },
        ],
        speed: 'medium',
      },
    } as unknown as Scene;
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
  });

  it('resolves a CodeToUI scene with viewport screenshot', () => {
    const scene: Scene = {
      sceneId: 7,
      type: 'CodeToUI',
      durationInFrames: 300,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        code: 'const x = new LumeSpec();\nx.generate({ url });',
        language: 'javascript',
        screenshotKey: 'viewport',
      },
    };
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
  });

  it('resolves a CodeToUI scene gracefully when screenshot asset is missing', () => {
    const emptyAssets = {
      screenshots: {},
    } as unknown as Storyboard['assets'];
    const scene: Scene = {
      sceneId: 8,
      type: 'CodeToUI',
      durationInFrames: 300,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        code: 'const x = new LumeSpec();\nx.generate({ url });',
        screenshotKey: 'viewport',
      },
    };
    const el = resolveScene({ scene, assets: emptyAssets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
  });
});

describe('resolveScene — DeviceMockup', () => {
  const baseScene = {
    sceneId: 1,
    type: 'DeviceMockup' as const,
    durationInFrames: 150,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
  };
  const baseProps = {
    headline: 'Ship demos',
    screenshotKey: 'viewport' as const,
    device: 'laptop' as const,
    motion: 'pushIn' as const,
  };

  it('renders DeviceMockup for valid laptop scene', () => {
    const scene = { ...baseScene, props: baseProps } as unknown as Scene;
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
    // Component name check works because Vitest preserves React displayName
    expect((el.type as { displayName?: string; name?: string }).displayName ?? (el.type as { name?: string }).name).toBe('DeviceMockup');
  });

  it('falls back to HeroRealShot when device="phone"', () => {
    const scene = { ...baseScene, props: { ...baseProps, device: 'phone' as const } } as unknown as Scene;
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
    expect((el.type as { displayName?: string; name?: string }).displayName ?? (el.type as { name?: string }).name).toBe('HeroRealShot');
  });

  it('falls back to HeroRealShot when viewport screenshot is missing', () => {
    const scene = { ...baseScene, props: baseProps } as unknown as Scene;
    const emptyAssets = { screenshots: {} } as unknown as typeof assets;
    const el = resolveScene({ scene, assets: emptyAssets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
    expect((el.type as { displayName?: string; name?: string }).displayName ?? (el.type as { name?: string }).name).toBe('HeroRealShot');
  });
});

// Minimal type import so tests are self-contained
import type { Storyboard } from '@lumespec/schema';
