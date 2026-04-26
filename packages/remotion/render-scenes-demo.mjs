#!/usr/bin/env node
/**
 * Renders a 10-second demo video showcasing StatsCounter + ReviewMarquee.
 * No MinIO / S3 required — uses only text-based scenes.
 *
 * Usage:
 *   node packages/remotion/render-scenes-demo.mjs
 *
 * Output:
 *   out/scenes-demo.mp4  (1280×720, H.264, 30fps, 10s)
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT  = resolve(dirname(__filename), '../..');
const ENTRY      = resolve(REPO_ROOT, 'packages/remotion/src/Root.tsx');
const OUT_DIR    = resolve(REPO_ROOT, 'out');
const OUT_FILE   = resolve(OUT_DIR, 'scenes-demo.mp4');

mkdirSync(OUT_DIR, { recursive: true });

// 10-second storyboard — no screenshots needed.
// Scenes sum: 90 + 150 + 180 + 60 + 120 + 90 + 30 + 30 = 750 ... wait
// Let's just keep it simple: 4 scenes = 300 frames (10s).
const TOTAL_FRAMES = 300;

const storyboard = {
  videoConfig: {
    durationInFrames: TOTAL_FRAMES,
    fps: 30,
    brandColor: '#4f46e5',
    bgm: 'tech',
    showWatermark: false,
  },
  assets: {
    screenshots: {},
    sourceTexts: [
      'ship production-grade ai workflows in minutes',
      '10× faster deploys',
      '99.9% uptime guaranteed',
      '1,200+ engineering teams',
    ],
  },
  scenes: [
    // Scene 1 — hook (60 frames / 2s)
    {
      sceneId: 1,
      type: 'TextPunch',
      durationInFrames: 60,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { text: 'ship production-grade ai workflows in minutes', emphasis: 'primary' },
    },
    // Scene 2 — StatsCounter (120 frames / 4s)
    {
      sceneId: 2,
      type: 'StatsCounter',
      durationInFrames: 120,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        stats: [
          { value: '10×',    label: 'faster deploys' },
          { value: '99.9%',  label: 'uptime' },
          { value: '1,200+', label: 'engineering teams' },
        ],
      },
    },
    // Scene 3 — ReviewMarquee (90 frames / 3s)
    {
      sceneId: 3,
      type: 'ReviewMarquee',
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        speed: 'medium',
        reviews: [
          { text: 'Completely changed how we ship product. Every engineer on the team loves it.', author: 'Alice Chen' },
          { text: 'The onboarding was effortless and the support team is genuinely world-class.', author: 'Bob Lee' },
          { text: 'We cut our release cycle from two weeks down to one day with this tool.', author: 'Sam Wu' },
          { text: 'Incredible reliability. We have not had a single outage since switching over.', author: 'Dana Park' },
        ],
      },
    },
    // Scene 4 — CTA (30 frames / 1s)
    {
      sceneId: 4,
      type: 'CTA',
      durationInFrames: 30,
      entryAnimation: 'zoomIn',
      exitAnimation: 'fade',
      props: {
        headline: 'ship production-grade ai workflows in minutes',
        url: 'https://lumespec.com',
      },
    },
  ],
};

const inputProps = {
  ...storyboard,
  sourceUrl: 'https://lumespec.com',
  resolverEndpoint: 'http://localhost:9000',
  forcePathStyle: true,
};

console.log('[scenes-demo] Bundling…');
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: ENTRY, webpackOverride: (c) => c });
console.log(`[scenes-demo] Bundle ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

console.log('[scenes-demo] Selecting composition…');
const composition = await selectComposition({
  serveUrl,
  id: 'MainComposition',
  inputProps,
});

console.log(`[scenes-demo] Rendering ${TOTAL_FRAMES} frames → ${OUT_FILE}`);
const t1 = Date.now();
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: OUT_FILE,
  inputProps,
  // Only render our 10s — the registered composition duration is longer (900 frames)
  // but TransitionSeries stops at the last scene naturally.
  frameRange: [0, TOTAL_FRAMES - 1],
  ...(process.env.PUPPETEER_EXECUTABLE_PATH
    ? { chromiumOptions: { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } }
    : {}),
  onProgress: ({ progress }) => {
    process.stdout.write(`\r[scenes-demo] ${(progress * 100).toFixed(0)}%  `);
  },
});
process.stdout.write('\n');
console.log(`[scenes-demo] Done in ${((Date.now() - t1) / 1000).toFixed(1)}s → ${OUT_FILE}`);
