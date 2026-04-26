/**
 * Crawler Pressure Test
 *
 * Runs the full Playwright track against real SaaS URLs and saves results locally.
 *
 * Usage (from repo root):
 *   pnpm --filter @lumespec/worker-crawler tsx scripts/pressure-test.ts [URL...]
 *
 * No URLs → uses DEFAULT_URLS below.
 *
 * Output per URL → test-results/<hostname>/
 *   viewport.jpg   ← check: no cookie banner or chat widget overlay
 *   fullpage.jpg   ← full-page scrollable screenshot
 *   result.json    ← logos, codeSnippets, brand colors, features
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runPlaywrightTrack, closePlaywrightBrowser } from '../src/tracks/playwrightTrack.js';

const OUT_DIR = resolve(process.cwd(), 'test-results');
const TIMEOUT_MS = 20_000;

const DEFAULT_URLS = [
  'https://linear.app',
  'https://vercel.com',
  'https://stripe.com',
  'https://intercom.com',  // self-hosting their own widget — best overlay smoke test
  'https://zendesk.com',   // same
  'https://notion.so',
  'https://figma.com',
];

const urls = process.argv.slice(2).filter(a => a !== '--').length > 0
  ? process.argv.slice(2).filter(a => a !== '--')
  : DEFAULT_URLS;

function dirSlug(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/[^a-z0-9.-]/gi, '-');
  }
}

console.log(`\n=== LumeSpec Crawler Pressure Test ===`);
console.log(`  URLs    : ${urls.length}`);
console.log(`  Timeout : ${TIMEOUT_MS / 1000}s each`);
console.log(`  Output  : ${OUT_DIR}\n`);

let passed = 0;
let failed = 0;

for (const url of urls) {
  const label = dirSlug(url);
  const outDir = resolve(OUT_DIR, label);
  mkdirSync(outDir, { recursive: true });

  process.stdout.write(`  ${label.padEnd(34)}`);

  const start = Date.now();
  try {
    const result = await runPlaywrightTrack({ url, timeoutMs: TIMEOUT_MS });
    const elapsedS = ((Date.now() - start) / 1000).toFixed(1);

    if (result.kind !== 'ok') {
      const reason = result.kind === 'blocked' ? result.reason : result.message;
      process.stdout.write(`FAIL    ${result.kind}:${reason}  (${elapsedS}s)\n`);
      writeFileSync(
        resolve(outDir, 'result.json'),
        JSON.stringify({ url, kind: result.kind, reason }, null, 2),
      );
      failed++;
      continue;
    }

    // Save screenshots to disk
    writeFileSync(resolve(outDir, 'viewport.jpg'), result.viewportScreenshot);
    writeFileSync(resolve(outDir, 'fullpage.jpg'), result.fullPageScreenshot);

    // Save extracted data
    const summary = {
      url,
      elapsedMs: Date.now() - start,
      colors: result.colors,
      fontFamily: result.fontFamily ?? null,
      logoCandidate: result.logoCandidate,
      logoSrcCandidatesCount: result.logoSrcCandidates.length,
      logoSrcCandidates: result.logoSrcCandidates,
      codeSnippetsCount: result.codeSnippets.length,
      codeSnippets: result.codeSnippets,
      featuresCount: result.features.length,
      reviewsCount: result.reviews.length,
    };
    writeFileSync(resolve(outDir, 'result.json'), JSON.stringify(summary, null, 2));

    const logos   = result.logoSrcCandidates.length;
    const snips   = result.codeSnippets.length;
    const primary = result.colors.primary ?? '—';
    process.stdout.write(`OK      ${elapsedS}s  logos=${logos}  snippets=${snips}  primary=${primary}\n`);
    passed++;
  } catch (err) {
    const elapsedS = ((Date.now() - start) / 1000).toFixed(1);
    const msg = (err as Error).message.slice(0, 60);
    process.stdout.write(`CRASH   ${msg}  (${elapsedS}s)\n`);
    writeFileSync(
      resolve(outDir, 'result.json'),
      JSON.stringify({ url, error: (err as Error).message }, null, 2),
    );
    failed++;
  }
}

await closePlaywrightBrowser();

console.log(`\n  ${passed} OK  |  ${failed} failed`);
console.log(`  Open test-results/ to inspect screenshots and result.json\n`);
