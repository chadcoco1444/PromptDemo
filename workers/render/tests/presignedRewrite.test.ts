import { describe, it, expect, vi } from 'vitest';
import { rewriteStoryboardUrls } from '../src/presignedRewrite.js';
import type { Storyboard } from '@lumespec/schema';

const sb = {
  videoConfig: {
    durationInFrames: 900,
    fps: 30,
    brandColor: '#111111',
    logoUrl: 's3://b/logo.png',
    bgm: 'none',
  },
  assets: {
    screenshots: {
      viewport: 's3://b/v.jpg',
      fullPage: 's3://b/full.jpg',
    },
    sourceTexts: ['x'],
  },
  scenes: [{
    sceneId: 1,
    type: 'TextPunch',
    durationInFrames: 900,
    entryAnimation: 'fade',
    exitAnimation: 'fade',
    props: { text: 'x', emphasis: 'primary' },
  }],
} as unknown as Storyboard;

describe('rewriteStoryboardUrls', () => {
  it('replaces every s3:// URI in videoConfig.logoUrl + screenshots', async () => {
    const sign = vi.fn().mockImplementation(async (uri: string) => `https://signed/${uri.slice(5)}`);
    const out = await rewriteStoryboardUrls(sb, sign);
    expect(out.videoConfig.logoUrl).toBe('https://signed/b/logo.png');
    expect((out.assets.screenshots as any).viewport).toBe('https://signed/b/v.jpg');
    expect((out.assets.screenshots as any).fullPage).toBe('https://signed/b/full.jpg');
    expect(sign).toHaveBeenCalledTimes(3);
  });

  it('handles storyboards with no screenshots / no logo (Tier B fallback)', async () => {
    const tierB = { ...sb, videoConfig: { ...sb.videoConfig, logoUrl: undefined }, assets: { ...sb.assets, screenshots: {} } };
    const sign = vi.fn();
    const out = await rewriteStoryboardUrls(tierB as any, sign);
    expect(sign).not.toHaveBeenCalled();
    expect(out.assets.screenshots).toEqual({});
  });
});
