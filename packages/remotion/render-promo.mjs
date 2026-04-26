#!/usr/bin/env node
/**
 * Renders PromoComposition (7-scene) at both 30s and 60s durations.
 * Always produces MP4 + GIF for each (ffmpeg required on PATH).
 *
 * Lives inside packages/remotion/ so Node ESM can resolve @remotion/* from
 * this package's own node_modules. Invoked via `pnpm lume render:promo`.
 *
 * Output (all created/overwritten):
 *   docs/readme/demo-30s.mp4          — 30-second version
 *   docs/readme/demo-30s.gif          — 30-second GIF (960×540, 15fps)
 *   docs/readme/demo-60s.mp4          — 60-second version
 *   docs/readme/demo-60s.gif          — 60-second GIF (960×540, 15fps)
 *   apps/web/public/demo.mp4          — copy of 30s (landing page autoplay)
 *   docs/readme/demo.gif              — copy of 30s GIF (README)
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '../..');
const ENTRY_POINT = resolve(REPO_ROOT, 'packages/remotion/src/Root.tsx');
const OUT_DIR = resolve(REPO_ROOT, 'docs/readme');
const WEB_PUBLIC = resolve(REPO_ROOT, 'apps/web/public');

const OUT_30S_MP4 = resolve(OUT_DIR, 'demo-30s.mp4');
const OUT_30S_GIF = resolve(OUT_DIR, 'demo-30s.gif');
const OUT_60S_MP4 = resolve(OUT_DIR, 'demo-60s.mp4');
const OUT_60S_GIF = resolve(OUT_DIR, 'demo-60s.gif');
const README_GIF  = resolve(OUT_DIR, 'demo.gif');
const LANDING_MP4 = resolve(WEB_PUBLIC, 'demo.mp4');

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(WEB_PUBLIC, { recursive: true });

// ─── ffmpeg resolution ───────────────────────────────────────────────────────

function findFfmpegWin() {
  const w = spawnSync('where.exe', ['ffmpeg'], { encoding: 'utf8', windowsHide: true });
  if (w.status === 0) return w.stdout.trim().split(/\r?\n/)[0].trim();

  const ps = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command',
     '(Get-Command ffmpeg -ErrorAction SilentlyContinue).Source'],
    { encoding: 'utf8', windowsHide: true },
  );
  const psOut = ps.stdout?.trim();
  if (ps.status === 0 && psOut) return psOut;

  const local = process.env.LOCALAPPDATA ?? '';
  const candidates = [
    resolve(local, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
    resolve(local, 'Microsoft', 'WindowsApps', 'ffmpeg.exe'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;

  const pkgs = resolve(local, 'Microsoft', 'WinGet', 'Packages');
  if (existsSync(pkgs)) {
    for (const pkg of readdirSync(pkgs)) {
      if (!pkg.toLowerCase().includes('ffmpeg')) continue;
      const found = walkForFfmpeg(resolve(pkgs, pkg));
      if (found) return found;
    }
  }
  return null;
}

function walkForFfmpeg(dir, depth = 0) {
  if (depth > 3) return null;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const sub = resolve(dir, e.name);
    const candidate = resolve(sub, 'ffmpeg.exe');
    if (existsSync(candidate)) return candidate;
    const deeper = walkForFfmpeg(sub, depth + 1);
    if (deeper) return deeper;
  }
  return null;
}

const isWin = process.platform === 'win32';
const ffmpegBin = isWin ? findFfmpegWin() : 'ffmpeg';
if (!ffmpegBin) {
  console.error('[render-promo] ffmpeg not found — required for GIF output.');
  console.error('  Install: winget install ffmpeg');
  console.error('  Then open a fresh terminal and re-run.');
  process.exit(1);
}
if (isWin) console.log(`[render-promo] ffmpeg: ${ffmpegBin}`);

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeGif(inMp4, outGif) {
  const paletteFile = outGif.replace(/\.gif$/, '_palette.png');
  console.log(`[render-promo] GIF palette pass → ${basename(outGif)}…`);
  const pass1 = spawnSync(ffmpegBin, [
    '-y', '-i', inMp4,
    '-vf', 'fps=15,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff',
    paletteFile,
  ], { stdio: 'inherit', windowsHide: true });
  if (pass1.status !== 0) {
    console.error('[render-promo] ffmpeg palette pass failed');
    process.exit(1);
  }

  console.log(`[render-promo] GIF encode pass → ${basename(outGif)}…`);
  const pass2 = spawnSync(ffmpegBin, [
    '-y', '-i', inMp4, '-i', paletteFile,
    '-lavfi', 'fps=15,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5',
    outGif,
  ], { stdio: 'inherit', windowsHide: true });
  if (pass2.status !== 0) {
    console.error('[render-promo] ffmpeg GIF encode failed');
    process.exit(1);
  }

  spawnSync(isWin ? 'del' : 'rm', [paletteFile], { shell: true });
  console.log(`[render-promo] GIF written → ${basename(outGif)}`);
}

// ─── bundle ──────────────────────────────────────────────────────────────────

console.log('[render-promo] Bundling Remotion entry point…');
const bundleStart = Date.now();
const serveUrl = await bundle({
  entryPoint: ENTRY_POINT,
  webpackOverride: (config) => config,
});
console.log(`[render-promo] Bundle ready in ${((Date.now() - bundleStart) / 1000).toFixed(1)}s`);

const chromiumOpts = process.env.PUPPETEER_EXECUTABLE_PATH
  ? { chromiumOptions: { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } }
  : {};

// ─── 30-second render ────────────────────────────────────────────────────────

console.log('\n[render-promo] ── 30-second version ──');
const comp30 = await selectComposition({ serveUrl, id: 'PromoComposition', inputProps: {} });
console.log(`[render-promo] ${comp30.durationInFrames} frames @ ${comp30.fps}fps (${(comp30.durationInFrames / comp30.fps).toFixed(1)}s)`);

const render30Start = Date.now();
await renderMedia({
  composition: comp30,
  serveUrl,
  codec: 'h264',
  outputLocation: OUT_30S_MP4,
  inputProps: {},
  ...chromiumOpts,
  onProgress: ({ progress }) => process.stdout.write(`\r[render-promo] 30s ${(progress * 100).toFixed(0)}%`),
});
process.stdout.write('\n');
console.log(`[render-promo] MP4 written in ${((Date.now() - render30Start) / 1000).toFixed(1)}s → ${basename(OUT_30S_MP4)}`);

makeGif(OUT_30S_MP4, OUT_30S_GIF);

// ─── 60-second render ────────────────────────────────────────────────────────

console.log('\n[render-promo] ── 60-second version ──');
const comp60 = await selectComposition({ serveUrl, id: 'PromoComposition60', inputProps: {} });
console.log(`[render-promo] ${comp60.durationInFrames} frames @ ${comp60.fps}fps (${(comp60.durationInFrames / comp60.fps).toFixed(1)}s)`);

const render60Start = Date.now();
await renderMedia({
  composition: comp60,
  serveUrl,
  codec: 'h264',
  outputLocation: OUT_60S_MP4,
  inputProps: {},
  ...chromiumOpts,
  onProgress: ({ progress }) => process.stdout.write(`\r[render-promo] 60s ${(progress * 100).toFixed(0)}%`),
});
process.stdout.write('\n');
console.log(`[render-promo] MP4 written in ${((Date.now() - render60Start) / 1000).toFixed(1)}s → ${basename(OUT_60S_MP4)}`);

makeGif(OUT_60S_MP4, OUT_60S_GIF);

// ─── copy canonical outputs ──────────────────────────────────────────────────

console.log('\n[render-promo] Copying canonical outputs…');
copyFileSync(OUT_30S_MP4, LANDING_MP4);
console.log(`[render-promo] Landing preview → ${LANDING_MP4}`);
copyFileSync(OUT_30S_GIF, README_GIF);
console.log(`[render-promo] README GIF     → ${README_GIF}`);

console.log('\n[render-promo] Done. All outputs:');
console.log(`  ${OUT_30S_MP4}`);
console.log(`  ${OUT_30S_GIF}`);
console.log(`  ${OUT_60S_MP4}`);
console.log(`  ${OUT_60S_GIF}`);
console.log(`  ${LANDING_MP4}  (30s copy)`);
console.log(`  ${README_GIF}   (30s copy)`);
