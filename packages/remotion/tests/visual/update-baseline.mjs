#!/usr/bin/env node
/**
 * Promote tests/visual/actuals/*.png → tests/visual/baselines/*.png.
 *
 * Run AFTER the visual test has produced fresh actuals AND a human has
 * eyeballed each one to confirm it's correct. This script does NOT
 * verify correctness — it just copies. The eyeball step is not optional.
 *
 * Usage:
 *   pnpm --filter @lumespec/remotion test:visual:baseline
 *
 * If actuals/ is empty (no test run yet), this prints a hint and exits 1.
 */

import { readdirSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACTUALS_DIR = resolve(__dirname, 'actuals');
const BASELINES_DIR = resolve(__dirname, 'baselines');

mkdirSync(BASELINES_DIR, { recursive: true });

if (!existsSync(ACTUALS_DIR)) {
  console.error('[update-baseline] No actuals/ directory found. Run `pnpm test:visual` first to generate frames.');
  process.exit(1);
}

const pngs = readdirSync(ACTUALS_DIR)
  .filter((f) => f.endsWith('.png') && !f.endsWith('-diff.png'));

if (pngs.length === 0) {
  console.error('[update-baseline] No actual PNGs to promote. Run `pnpm test:visual` first.');
  process.exit(1);
}

console.log(`[update-baseline] Promoting ${pngs.length} actual(s) → baseline(s):`);
for (const file of pngs) {
  const src = resolve(ACTUALS_DIR, file);
  const dst = resolve(BASELINES_DIR, file);
  copyFileSync(src, dst);
  console.log(`  ${basename(src)}  →  baselines/${basename(dst)}`);
}
console.log('[update-baseline] Done. Remember to `git add tests/visual/baselines/` and commit.');
