import { describe, it, expect } from 'vitest';
import { extractiveCheck, collectSceneTexts } from '../src/validation/extractiveCheck.js';
import type { Storyboard } from '@lumespec/schema';

const basePool = [
  'ship production-grade ai workflows in minutes',
  'connect your data, run agents, see results',
  'one-click data sync',
];

function sb(scenes: Storyboard['scenes']): Storyboard {
  return {
    videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
    assets: { screenshots: {}, sourceTexts: basePool },
    scenes,
  };
}

describe('collectSceneTexts', () => {
  it('pulls title + subtitle from HeroRealShot', () => {
    const texts = collectSceneTexts({
      sceneId: 1,
      type: 'HeroRealShot',
      durationInFrames: 300,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { title: 'HELLO', subtitle: 'there', screenshotKey: 'viewport' },
    });
    expect(texts).toEqual(['HELLO', 'there']);
  });

  it('pulls headline + subtitle from DeviceMockup', () => {
    const texts = collectSceneTexts({
      sceneId: 1,
      type: 'DeviceMockup',
      durationInFrames: 300,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        headline: 'ship faster',
        subtitle: 'paste a url, get a video',
        screenshotKey: 'viewport',
        device: 'laptop',
        motion: 'pushIn',
      },
    });
    expect(texts).toEqual(['ship faster', 'paste a url, get a video']);
  });

  it('omits subtitle from DeviceMockup when absent', () => {
    const texts = collectSceneTexts({
      sceneId: 1,
      type: 'DeviceMockup',
      durationInFrames: 300,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        headline: 'ship faster',
        screenshotKey: 'viewport',
        device: 'laptop',
        motion: 'pullOut',
      },
    });
    expect(texts).toEqual(['ship faster']);
  });

  it('pulls bento items titles and descriptions', () => {
    const texts = collectSceneTexts({
      sceneId: 2,
      type: 'BentoGrid',
      durationInFrames: 300,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        items: [
          { title: 'a', description: 'aa' },
          { title: 'b' },
          { title: 'c' },
        ],
      },
    });
    expect(texts).toEqual(['a', 'aa', 'b', 'c']);
  });
});

describe('extractiveCheck (Latin)', () => {
  it('passes when every scene text has a Fuse match', () => {
    const board = sb([
      {
        sceneId: 1,
        type: 'HeroRealShot',
        durationInFrames: 300,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: {
          title: 'ship production-grade AI workflows in minutes',
          subtitle: 'connect your data, run agents, see results',
          screenshotKey: 'viewport',
        },
      },
    ]);
    const r = extractiveCheck(board);
    expect(r.kind).toBe('ok');
  });

  it('fails when a scene text has no source', () => {
    const board = sb([
      {
        sceneId: 1,
        type: 'TextPunch',
        durationInFrames: 300,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { text: 'totally invented marketing claim', emphasis: 'primary' },
      },
    ]);
    const r = extractiveCheck(board);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.violations[0]).toMatchObject({ sceneId: 1 });
    }
  });
});

describe('extractiveCheck (CJK)', () => {
  const cjkPool = ['自動化未來', '一鍵生成', '更好的工作流'];
  const cjkBoard: Storyboard = {
    videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
    assets: { screenshots: {}, sourceTexts: cjkPool },
    scenes: [],
  };

  it('passes on substring match within the pool', () => {
    const board: Storyboard = {
      ...cjkBoard,
      scenes: [
        {
          sceneId: 1,
          type: 'TextPunch',
          durationInFrames: 300,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: { text: '自動化未來', emphasis: 'primary' },
        },
      ],
    };
    const r = extractiveCheck(board);
    expect(r.kind).toBe('ok');
  });

  it('fails on CJK text not in pool', () => {
    const board: Storyboard = {
      ...cjkBoard,
      scenes: [
        {
          sceneId: 1,
          type: 'TextPunch',
          durationInFrames: 300,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: { text: '完全不存在的東西', emphasis: 'primary' },
        },
      ],
    };
    const r = extractiveCheck(board);
    expect(r.kind).toBe('error');
  });

  it('accepts middle-dot-joined feature list when every segment is in the pool', () => {
    // Real-world case: crawler extracted 4 separate feature tags; Claude
    // joined them with · for a compact scene display. Each segment must
    // independently match the whitelist — no hallucinations.
    const board: Storyboard = {
      videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
      assets: {
        screenshots: {},
        sourceTexts: [
          'protocols & standards',
          'embedded systems',
          'programming & tools',
          'domain knowledge',
        ],
      },
      scenes: [
        {
          sceneId: 1,
          type: 'TextPunch',
          durationInFrames: 300,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: {
            text: 'protocols & standards · embedded systems · programming & tools · domain knowledge',
            emphasis: 'primary',
          },
        },
      ],
    };
    expect(extractiveCheck(board).kind).toBe('ok');
  });

  it('also accepts pipe- and space-slash-separated joins', () => {
    const board: Storyboard = {
      videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
      assets: { screenshots: {}, sourceTexts: ['alpha', 'beta', 'gamma'] },
      scenes: [
        { sceneId: 1, type: 'TextPunch', durationInFrames: 300,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { text: 'alpha | beta | gamma', emphasis: 'primary' } },
        { sceneId: 2, type: 'TextPunch', durationInFrames: 300,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { text: 'alpha / beta / gamma', emphasis: 'primary' } },
      ],
    };
    expect(extractiveCheck(board).kind).toBe('ok');
  });

  it('still REJECTS a concatenation where ANY segment is hallucinated', () => {
    // The 3rd segment ("made up feature") isn't in the pool — must fail.
    const board: Storyboard = {
      videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
      assets: { screenshots: {}, sourceTexts: ['real a', 'real b'] },
      scenes: [
        {
          sceneId: 1,
          type: 'TextPunch',
          durationInFrames: 300,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: { text: 'real a · real b · made up feature', emphasis: 'primary' },
        },
      ],
    };
    expect(extractiveCheck(board).kind).toBe('error');
  });

  it('does NOT split inline uses of / and - (only space-padded separators)', () => {
    const board: Storyboard = {
      videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
      assets: { screenshots: {}, sourceTexts: ['AI/ML platform', 'multi-tenant architecture'] },
      scenes: [
        { sceneId: 1, type: 'TextPunch', durationInFrames: 300,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { text: 'AI/ML platform', emphasis: 'primary' } },
      ],
    };
    expect(extractiveCheck(board).kind).toBe('ok');
  });

  it('accepts comma-joined natural prose when every segment is in the pool', () => {
    // Real-world case 2026-04-25: Claude joined 4 extracted skills with
    // commas + "and" — a common construction when pulling bullet points
    // into a grammatical sentence.
    const board: Storyboard = {
      videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
      assets: {
        screenshots: {},
        sourceTexts: [
          'Senior Firmware Engineer specializing in NR/LTE cellular protocol stack',
          'Embedded systems',
          '3GPP RRC/NAS protocols',
        ],
      },
      scenes: [
        {
          sceneId: 1,
          type: 'TextPunch',
          durationInFrames: 300,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: {
            text: 'senior firmware engineer specializing in nr/lte cellular protocol stack, embedded systems, and 3gpp rrc/nas protocols.',
            emphasis: 'primary',
          },
        },
      ],
    };
    expect(extractiveCheck(board).kind).toBe('ok');
  });

  it('trims leading "and"/"or" + trailing punctuation from each comma segment', () => {
    const board: Storyboard = {
      videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
      assets: { screenshots: {}, sourceTexts: ['fast', 'reliable', 'secure'] },
      scenes: [
        { sceneId: 1, type: 'TextPunch', durationInFrames: 300,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { text: 'fast, reliable, and secure!', emphasis: 'primary' } },
      ],
    };
    expect(extractiveCheck(board).kind).toBe('ok');
  });

  it('rejects comma list when one segment is hallucinated', () => {
    const board: Storyboard = {
      videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
      assets: { screenshots: {}, sourceTexts: ['fast', 'reliable'] },
      scenes: [
        { sceneId: 1, type: 'TextPunch', durationInFrames: 300,
          entryAnimation: 'fade', exitAnimation: 'fade',
          props: { text: 'fast, reliable, and supercalifragilistic.', emphasis: 'primary' } },
      ],
    };
    expect(extractiveCheck(board).kind).toBe('error');
  });

  it('accepts period-separated sentences when every sentence is in the pool', () => {
    // Real-world pattern: Claude generates BentoGrid/FeatureCallout descriptions
    // by joining multiple source-page sentences with full stops.
    const board: Storyboard = {
      videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
      assets: {
        screenshots: {},
        sourceTexts: [
          'Scale with confidence',
          'Choose an integration path',
          'Connect to existing systems',
        ],
      },
      scenes: [
        {
          sceneId: 1,
          type: 'FeatureCallout',
          durationInFrames: 300,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: {
            title: 'Scale with confidence',
            description: 'Scale with confidence. Choose an integration path. Connect to existing systems.',
            layout: 'leftImage' as const,
            variant: 'image' as const,
          },
        },
      ],
    };
    expect(extractiveCheck(board).kind).toBe('ok');
  });

  it('rejects period-separated sentences when any sentence is not in the pool', () => {
    const board: Storyboard = {
      videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none', showWatermark: false },
      assets: {
        screenshots: {},
        sourceTexts: ['Scale with confidence', 'Choose an integration path'],
      },
      scenes: [
        {
          sceneId: 1,
          type: 'FeatureCallout',
          durationInFrames: 300,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: {
            title: 'Scale with confidence',
            description: 'Scale with confidence. Choose an integration path. Completely invented sentence.',
            layout: 'leftImage' as const,
            variant: 'image' as const,
          },
        },
      ],
    };
    expect(extractiveCheck(board).kind).toBe('error');
  });
});
