#!/usr/bin/env node
/**
 * Renders PromoComposition → docs/readme/demo.mp4
 *
 * Lives inside packages/remotion/ so Node ESM can resolve @remotion/* from
 * this package's own node_modules. Invoked via `pnpm lume render:promo`.
 *
 * Usage:
 *   node packages/remotion/render-promo.mjs [--gif]
 *
 * Flags:
 *   --gif   Also produce docs/readme/demo.gif via ffmpeg (needs ffmpeg on PATH).
 *
 * Output:
 *   docs/readme/demo.mp4   — 1280×720, H.264, 30fps, 20s
 *   docs/readme/demo.gif   — 960×540, 15fps, palette-optimised (--gif only)
 */

import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
// This file is at packages/remotion/render-promo.mjs → two levels up = repo root
const REPO_ROOT = resolve(dirname(__filename), '../..');
const ENTRY_POINT = resolve(REPO_ROOT, 'packages/remotion/src/Root.tsx');
const OUT_DIR = resolve(REPO_ROOT, 'docs/readme');
const OUT_MP4 = resolve(OUT_DIR, 'demo.mp4');
const OUT_GIF = resolve(OUT_DIR, 'demo.gif');
const COMPOSITION_ID = 'PromoComposition';

const makeGif = process.argv.includes('--gif');

mkdirSync(OUT_DIR, { recursive: true });

console.log('[render-promo] Bundling Remotion entry point…');
const bundleStart = Date.now();
const serveUrl = await bundle({
  entryPoint: ENTRY_POINT,
  webpackOverride: (config) => config,
});
console.log(`[render-promo] Bundle ready in ${((Date.now() - bundleStart) / 1000).toFixed(1)}s`);

console.log(`[render-promo] Selecting composition "${COMPOSITION_ID}"…`);
const composition = await selectComposition({
  serveUrl,
  id: COMPOSITION_ID,
  inputProps: {},
});
console.log(`[render-promo] Composition: ${composition.durationInFrames} frames @ ${composition.fps}fps (${(composition.durationInFrames / composition.fps).toFixed(1)}s)`);

console.log('[render-promo] Rendering MP4…');
const renderStart = Date.now();
await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  outputLocation: OUT_MP4,
  inputProps: {},
  ...(process.env.PUPPETEER_EXECUTABLE_PATH
    ? { chromiumOptions: { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH } }
    : {}),
  onProgress: ({ progress }) => {
    process.stdout.write(`\r[render-promo] ${(progress * 100).toFixed(0)}%`);
  },
});
process.stdout.write('\n');
console.log(`[render-promo] MP4 written to ${OUT_MP4} in ${((Date.now() - renderStart) / 1000).toFixed(1)}s`);

if (makeGif) {
  // On Windows, winget installs a command-line alias that bare spawnSync misses
  // when the terminal hasn't been fully restarted. Use where.exe to resolve the
  // real executable path before spawning.
  function findFfmpegWin() {
    // 1. where.exe — finds anything already on the inherited PATH
    const w = spawnSync('where.exe', ['ffmpeg'], { encoding: 'utf8', windowsHide: true });
    if (w.status === 0) return w.stdout.trim().split(/\r?\n/)[0].trim();

    // 2. PowerShell Get-Command — resolves App Execution Aliases (winget's
    //    "command-line aliases" live in %LOCALAPPDATA%\Microsoft\WindowsApps\)
    const ps = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command',
       '(Get-Command ffmpeg -ErrorAction SilentlyContinue).Source'],
      { encoding: 'utf8', windowsHide: true },
    );
    const psOut = ps.stdout?.trim();
    if (ps.status === 0 && psOut) return psOut;

    // 3. Known winget alias / package locations
    const local = process.env.LOCALAPPDATA ?? '';
    const candidates = [
      resolve(local, 'Microsoft', 'WinGet', 'Links', 'ffmpeg.exe'),
      resolve(local, 'Microsoft', 'WindowsApps', 'ffmpeg.exe'),
    ];
    for (const c of candidates) if (existsSync(c)) return c;

    // 4. Walk winget Packages tree for the first ffmpeg.exe under a bin\ dir
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
    console.error('[render-promo] ffmpeg not found.');
    console.error('  Install: winget install ffmpeg');
    console.error('  Then open a fresh terminal and re-run.');
    process.exit(1);
  }
  if (isWin) console.log(`[render-promo] ffmpeg: ${ffmpegBin}`);

  const paletteFile = resolve(OUT_DIR, '_palette.png');
  console.log('[render-promo] Converting to GIF (palette pass 1)…');
  const pass1 = spawnSync(ffmpegBin, [
    '-y', '-i', OUT_MP4,
    '-vf', 'fps=15,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff',
    paletteFile,
  ], { stdio: 'inherit', windowsHide: true });
  if (pass1.status !== 0) {
    console.error('[render-promo] ffmpeg palette pass failed');
    process.exit(1);
  }

  console.log('[render-promo] Converting to GIF (palette pass 2)…');
  const pass2 = spawnSync(ffmpegBin, [
    '-y', '-i', OUT_MP4, '-i', paletteFile,
    '-lavfi', 'fps=15,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5',
    OUT_GIF,
  ], { stdio: 'inherit', windowsHide: true });
  if (pass2.status !== 0) {
    console.error('[render-promo] ffmpeg GIF pass failed');
    process.exit(1);
  }

  spawnSync(isWin ? 'del' : 'rm', [paletteFile], { shell: true });
  console.log(`[render-promo] GIF written to ${OUT_GIF}`);
}

console.log('[render-promo] Done.');
