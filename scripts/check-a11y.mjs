#!/usr/bin/env node
/**
 * Lighthouse accessibility score checker.
 * Requires the dev server to be running: pnpm lume start
 *
 * Usage:
 *   node scripts/check-a11y.mjs
 *   node scripts/check-a11y.mjs --base-url http://localhost:3001
 *
 * Exits 0 if all routes score >= MIN_SCORE, exits 1 otherwise.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIN_SCORE = 0.95;
const BASE_URL = process.argv.includes('--base-url')
  ? process.argv[process.argv.indexOf('--base-url') + 1]
  : 'http://localhost:3001';

const ROUTES = ['/', '/history', '/billing'];

let allPassed = true;
const results = [];

for (const route of ROUTES) {
  const url = `${BASE_URL}${route}`;
  const outPath = resolve(__dirname, `_lh-${route.replace(/\//g, '-') || 'home'}.json`);

  console.log(`\nChecking ${url} ...`);
  const r = spawnSync(
    'lighthouse',
    [
      url,
      '--only-categories=accessibility',
      '--output=json',
      `--output-path=${outPath}`,
      '--chrome-flags=--headless --no-sandbox --disable-gpu',
      '--quiet',
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );

  if (r.status !== 0 || !existsSync(outPath)) {
    console.error(`  ✗ Lighthouse failed to run on ${url}`);
    allPassed = false;
    results.push({ route, score: null, passed: false });
    continue;
  }

  const report = JSON.parse(readFileSync(outPath, 'utf8'));
  unlinkSync(outPath);
  const score = report.categories?.accessibility?.score ?? null;
  const passed = score !== null && score >= MIN_SCORE;
  allPassed = allPassed && passed;
  results.push({ route, score, passed });
  console.log(`  ${passed ? '✓' : '✗'} a11y score: ${score !== null ? (score * 100).toFixed(0) : 'n/a'}% (min: ${MIN_SCORE * 100}%)`);
}

console.log('\n--- Summary ---');
for (const { route, score, passed } of results) {
  const pct = score !== null ? `${(score * 100).toFixed(0)}%` : 'failed';
  console.log(`  ${passed ? '✓' : '✗'} ${route.padEnd(12)} ${pct}`);
}

if (!allPassed) {
  console.error('\nSome routes are below the accessibility threshold. Fix the issues above.');
  process.exit(1);
}
console.log('\nAll routes passed accessibility check.');
