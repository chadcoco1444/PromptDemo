/**
 * Visual regression smoke for PromoComposition.
 *
 * Renders ONE still per scene at a frame where the scene's animations have
 * settled (clear of the OVERLAP fade-in/out zones at the edges) and pixel-
 * compares it against a checked-in baseline PNG. The 0.5% tolerance lets
 * font anti-aliasing breathe between minor Chromium versions while still
 * catching layout collapses (e.g. the AbsoluteFill flex-direction bug from
 * 2026-04-27 would have failed Scene 2 + Scene 7 with diff > 50%).
 *
 * Workflow:
 *   - Normal CI run: `pnpm test` (or `pnpm test:visual`) — fails on regression.
 *   - Intentional visual change: review actuals/, then `pnpm test:visual:baseline`
 *     to promote actuals → baselines, then commit the new baselines.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { bundle } from '@remotion/bundler';
import { selectComposition, renderStill } from '@remotion/renderer';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTRY_POINT = resolve(__dirname, '..', '..', 'src', 'Root.tsx');
const BASELINES_DIR = resolve(__dirname, 'baselines');
const ACTUALS_DIR = resolve(__dirname, 'actuals');

mkdirSync(ACTUALS_DIR, { recursive: true });

/**
 * Frame picks per scene (PromoComposition 30s = 900f).
 * Scene boundaries derived from PromoComposition.tsx orchestration:
 *   S1 0-90  S2 90-210  S3 210-360  S4 360-510  S5 510-600  S6 600-750  S7 750-900
 * Picked frames are mid-content, post-stagger, pre-fadeout — most layout-stable.
 */
interface FrameSpec {
  name: string;
  frame: number;
  description: string;
}

const KEY_FRAMES: FrameSpec[] = [
  { name: 'scene1-url-input',    frame: 60,  description: 'URL typing animation settled' },
  { name: 'scene2-crawl-json',   frame: 195, description: 'Crawl steps + Storyboard JSON both visible' },
  { name: 'scene3-gallery',      frame: 330, description: 'All 9 scene-type cards settled' },
  { name: 'scene4-preview',      frame: 480, description: 'Preview card + Pill Badge stable' },
  { name: 'scene5-history',      frame: 580, description: 'History items stagger complete' },
  { name: 'scene6-logo-cloud',   frame: 700, description: 'LogoCloud marquee mid-scroll' },
  { name: 'scene7-code-to-ui',   frame: 870, description: 'Code typed + Stripe preview revealed' },
];

const PIXEL_DIFF_THRESHOLD = 0.005; // 0.5% — Q D.3 calibration
const PIXELMATCH_THRESHOLD = 0.1;   // pixelmatch sensitivity (0=strict, 1=permissive)
const COMPOSITION_ID = 'PromoComposition'; // 30s version per Root.tsx

// Remotion 4.x: top-level `browserExecutable: string | null`, NOT
// `chromiumOptions.executablePath` (which doesn't exist on ChromiumOptions).
// The original spelling silently passed when PUPPETEER_EXECUTABLE_PATH was
// unset (spread of `{}` is a no-op) but failed `exactOptionalPropertyTypes`.
const chromiumOpts = process.env.PUPPETEER_EXECUTABLE_PATH
  ? { browserExecutable: process.env.PUPPETEER_EXECUTABLE_PATH }
  : {};

let serveUrl: string;

beforeAll(async () => {
  // Bundle once; amortizes the ~10s cost across all 7 frames.
  serveUrl = await bundle({ entryPoint: ENTRY_POINT, webpackOverride: (c) => c });
}, 120_000);

describe('PromoComposition visual regression', () => {
  describe.each(KEY_FRAMES)('$name (frame $frame — $description)', ({ name, frame }) => {
    it('matches baseline within 0.5% pixel diff', async () => {
      const baselinePath = resolve(BASELINES_DIR, `${name}.png`);
      const actualPath = resolve(ACTUALS_DIR, `${name}.png`);
      const diffPath = resolve(ACTUALS_DIR, `${name}-diff.png`);

      const composition = await selectComposition({
        serveUrl,
        id: COMPOSITION_ID,
        inputProps: {},
      });

      await renderStill({
        composition,
        serveUrl,
        output: actualPath,
        frame,
        inputProps: {},
        ...chromiumOpts,
      });

      if (!existsSync(baselinePath)) {
        throw new Error(
          `No baseline at ${baselinePath}. ` +
          `Eyeball ${actualPath}, then run \`pnpm --filter @lumespec/remotion test:visual:baseline\` ` +
          `to promote it. Do NOT commit baselines without visually verifying them first.`,
        );
      }

      const baselinePng = PNG.sync.read(readFileSync(baselinePath));
      const actualPng = PNG.sync.read(readFileSync(actualPath));

      expect(actualPng.width).toBe(baselinePng.width);
      expect(actualPng.height).toBe(baselinePng.height);

      const diffPng = new PNG({ width: actualPng.width, height: actualPng.height });
      const numDiffPixels = pixelmatch(
        baselinePng.data,
        actualPng.data,
        diffPng.data,
        actualPng.width,
        actualPng.height,
        { threshold: PIXELMATCH_THRESHOLD },
      );
      const totalPixels = actualPng.width * actualPng.height;
      const diffRatio = numDiffPixels / totalPixels;

      if (diffRatio > PIXEL_DIFF_THRESHOLD) {
        // Persist diff image only when over threshold so the dev can eyeball it.
        writeFileSync(diffPath, PNG.sync.write(diffPng));
        throw new Error(
          `${name}: ${numDiffPixels} of ${totalPixels} pixels differ (${(diffRatio * 100).toFixed(2)}%). ` +
          `Threshold is ${(PIXEL_DIFF_THRESHOLD * 100).toFixed(1)}%. ` +
          `See ${diffPath} for visual diff.`,
        );
      }

      expect(diffRatio).toBeLessThanOrEqual(PIXEL_DIFF_THRESHOLD);
    }, 60_000);
  });
});
