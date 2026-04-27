#!/usr/bin/env node
/**
 * Regenerate the brand-color test fixtures. NOT run in CI — invoke
 * manually if you need to add or change a fixture:
 *
 *   node workers/crawler/tests/fixtures/colors/generate.mjs
 *
 * Each fixture is a small (64x64) PNG with a known dominant color so
 * the test assertions can be exact. Sharp's HSV-based dominant
 * detection should return the dominant region's color (or very close
 * to it within a small tolerance).
 */
import sharp from 'sharp';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function solid(hexR, hexG, hexB, name) {
  const buf = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: hexR, g: hexG, b: hexB } },
  }).png().toBuffer();
  const out = resolve(__dirname, `${name}.png`);
  await sharp(buf).toFile(out);
  console.log(`wrote ${out}`);
}

// 80% green region + 20% black region — proves Sharp correctly identifies
// the DOMINANT region rather than averaging.
async function mostlyGreen() {
  const green = await sharp({
    create: { width: 64, height: 51, channels: 3, background: { r: 88, g: 204, b: 2 } }, // #58cc02
  }).png().toBuffer();
  const black = await sharp({
    create: { width: 64, height: 13, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).png().toBuffer();
  const composite = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite([
      { input: green, top: 0, left: 0 },
      { input: black, top: 51, left: 0 },
    ])
    .png()
    .toBuffer();
  const out = resolve(__dirname, 'mostly-green.png');
  await sharp(composite).toFile(out);
  console.log(`wrote ${out}`);
}

await solid(88, 204, 2, 'solid-green');   // #58cc02 — Duolingo green
await solid(0, 0, 0, 'solid-black');      // #000000 — Vercel black
await mostlyGreen();
