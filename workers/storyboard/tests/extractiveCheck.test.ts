import { describe, it, expect } from 'vitest';
import { extractiveCheck, collectSceneTexts } from '../src/validation/extractiveCheck.js';
import type { Storyboard } from '@promptdemo/schema';

const basePool = [
  'ship production-grade ai workflows in minutes',
  'connect your data, run agents, see results',
  'one-click data sync',
];

function sb(scenes: Storyboard['scenes']): Storyboard {
  return {
    videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none' },
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
    videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none' },
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
});
