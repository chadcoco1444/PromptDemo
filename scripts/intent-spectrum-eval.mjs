#!/usr/bin/env node
/**
 * Intent Spectrum Evaluator — 3 URLs × 3 intents = 9-job matrix.
 *
 * Submits all 9 jobs in parallel, polls each for `storyboardUri` to appear,
 * fetches the storyboard.json from MinIO the moment it's ready (does NOT
 * wait for render to finish), then writes a 3x3 matrix comparison report.
 *
 * Usage:  node scripts/intent-spectrum-eval.mjs
 *
 * Wall time: ~2-3 min (storyboard worker concurrency=4, 9 jobs in 3 batches).
 * Cost: ~$0.50-1.50 for 9 Claude Sonnet calls.
 *
 * Render still runs in background after this script exits — that's fine, we
 * just don't block on it. The MP4 outputs are a side effect we don't use.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');

function loadDotenv() {
  const path = resolve(REPO_ROOT, '.env');
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadDotenv();

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';
const userId = process.env.DOGFOOD_USER_ID ?? '1';
const secret = process.env.INTERNAL_API_SECRET;
const minioBase = process.env.S3_ENDPOINT ?? 'http://localhost:9000';

if (!secret) {
  console.error('INTERNAL_API_SECRET not set — load .env first');
  process.exit(1);
}

const ALL_URLS = [
  { id: 'vercel',    label: 'Vercel (infra SaaS)',         url: 'https://vercel.com' },
  { id: 'duolingo',  label: 'Duolingo (digital learning)', url: 'https://www.duolingo.com' },
  { id: 'gopro',     label: 'GoPro (extreme sports gear)', url: 'https://gopro.com' },
  { id: 'patagonia', label: 'Patagonia (outdoor gear)',    url: 'https://www.patagonia.com/' },
];

// Optional INCLUDE_CELLS=url:intent,url:intent filter — runs only the listed
// cells. Used to retry transient failures or supplement after a swap.
const includeFilter = process.env.INCLUDE_CELLS
  ? new Set(process.env.INCLUDE_CELLS.split(',').map((s) => s.trim()))
  : null;
const URLS = includeFilter
  ? ALL_URLS.filter((u) => [...includeFilter].some((p) => p.startsWith(`${u.id}:`)))
  : ALL_URLS.filter((u) => u.id !== 'patagonia'); // default: original 3 (no patagonia)

const INTENTS = [
  {
    id: 'hardsell',
    label: '🔥 HARD-SELL HYPE',
    text: 'High-energy promotional spot. Short punchy scene durations. Emphasize speed, results, and aesthetic. Use a single powerful tagline. Tone: energetic, modern.',
  },
  {
    id: 'tech',
    label: '🔬 TECH DEEP-DIVE',
    text: 'Calm, methodical product walkthrough for technical buyers. Show concrete features and capabilities in sequence. Highlight what the product actually does, not why it matters emotionally. Tone: confident, precise, no marketing fluff.',
  },
  {
    id: 'emotional',
    label: '💫 EMOTIONAL BRAND STORY',
    text: 'A romantic, atmospheric brand story. Slow scene pacing. Emphasize aspiration, lifestyle, who-you-become rather than what-the-product-does. Tone: cinematic, evocative, human.',
  },
];

// ---- JWT helpers (same as dogfood-landing-demo.mjs) ----
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function mintJwt(sub, ttlSec = 1800) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: String(sub), iat: now, exp: now + ttlSec, iss: 'lumespec-web', aud: 'lumespec-api' };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}

const token = mintJwt(userId);
const auth = { Authorization: `Bearer ${token}` };
console.log(`[eval] minted JWT for user_id=${userId}, target=${apiBase}`);

// ---- build job list (full 3x3 OR include-filter subset) ----
const jobs = [];
for (const u of URLS) {
  for (const i of INTENTS) {
    if (includeFilter && !includeFilter.has(`${u.id}:${i.id}`)) continue;
    jobs.push({ urlSpec: u, intentSpec: i });
  }
}
console.log(`[eval] preparing ${jobs.length} jobs${includeFilter ? ` (filtered by INCLUDE_CELLS)` : ''}`);

// ---- submit all 9 jobs in parallel ----
async function submitJob(spec) {
  const body = { url: spec.urlSpec.url, intent: spec.intentSpec.text, duration: 30 };
  const res = await fetch(`${apiBase}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`POST failed for ${spec.urlSpec.id}/${spec.intentSpec.id}: ${res.status} ${txt}`);
  }
  const { jobId } = await res.json();
  console.log(`  submitted ${spec.urlSpec.id}/${spec.intentSpec.id} → ${jobId}`);
  return { ...spec, jobId };
}

// Group jobs by domain. Submit and poll each domain's 3 jobs SEQUENTIALLY
// (avoids the per-domain circuit breaker in workers/crawler colliding when
// multiple jobs hit the same hostname simultaneously). Different domains run
// in parallel — they have independent circuit state.
const byDomain = {};
for (const spec of jobs) {
  byDomain[spec.urlSpec.id] ??= [];
  byDomain[spec.urlSpec.id].push(spec);
}
console.log(`[eval] grouped into ${Object.keys(byDomain).length} domains, serial within each, parallel across`);
const submitStart = Date.now();

// ---- poll each job in parallel; resolve when storyboardUri appears ----
async function fetchStoryboardJson(uri) {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) throw new Error(`bad S3 URI: ${uri}`);
  const [, bucket, key] = m;
  const res = await fetch(`${minioBase}/${bucket}/${key}`);
  if (!res.ok) throw new Error(`MinIO GET failed: ${res.status}`);
  return res.json();
}

async function pollUntilStoryboard(spec) {
  const start = Date.now();
  let lastStage = null;
  while (true) {
    if (Date.now() - start > 8 * 60_000) {
      throw new Error(`timeout waiting for storyboard for ${spec.urlSpec.id}/${spec.intentSpec.id}`);
    }
    const r = await fetch(`${apiBase}/api/jobs/${spec.jobId}`, { headers: auth });
    if (!r.ok) throw new Error(`GET ${spec.jobId} failed: ${r.status}`);
    const job = await r.json();
    if (job.stage !== lastStage) {
      console.log(`  [${spec.urlSpec.id}/${spec.intentSpec.id}] stage=${job.stage} status=${job.status}`);
      lastStage = job.stage;
    }
    if (job.status === 'failed') {
      return { ...spec, error: job.error ?? 'unknown failure' };
    }
    if (job.storyboardUri) {
      const sb = await fetchStoryboardJson(job.storyboardUri);
      console.log(`  ✓ [${spec.urlSpec.id}/${spec.intentSpec.id}] storyboard captured (${sb.scenes?.length ?? 0} scenes)`);
      return { ...spec, storyboard: sb };
    }
    await new Promise((res) => setTimeout(res, 3_000));
  }
}

// Run each domain serially, all domains in parallel.
async function runDomain(domainSpecs) {
  const results = [];
  for (const spec of domainSpecs) {
    try {
      const submitted = await submitJob(spec);
      const result = await pollUntilStoryboard(submitted);
      results.push(result);
    } catch (err) {
      console.warn(`  ✗ [${spec.urlSpec.id}/${spec.intentSpec.id}] failed at submit/poll: ${err.message}`);
      results.push({ ...spec, error: { code: 'SUBMIT_OR_POLL_FAILED', message: err.message } });
    }
  }
  return results;
}

const domainResults = await Promise.all(Object.values(byDomain).map(runDomain));
const collected = domainResults.flat();
console.log(`\n[eval] all 9 jobs resolved in ${((Date.now() - submitStart) / 1000).toFixed(1)}s`);

// ---- index by url+intent for matrix lookup ----
const matrix = {};
for (const cell of collected) {
  matrix[cell.urlSpec.id] ??= {};
  matrix[cell.urlSpec.id][cell.intentSpec.id] = cell;
}

// Pretty-print whatever error shape we got (string | {code,message} | unknown).
function formatErr(err) {
  if (!err) return 'unknown';
  if (typeof err === 'string') return err;
  if (err.code && err.message) return `${err.code}: ${err.message}`;
  if (err.message) return String(err.message);
  return JSON.stringify(err);
}

// ---- summarize storyboard ----
function summarize(cell) {
  if (cell.error) return { error: cell.error };
  const scenes = cell.storyboard.scenes ?? [];
  return {
    sceneCount: scenes.length,
    sceneTypes: scenes.map((s) => s.type),
    sceneTypeCounts: scenes.reduce((acc, s) => ({ ...acc, [s.type]: (acc[s.type] ?? 0) + 1 }), {}),
    avgSceneDurSec: scenes.length
      ? Math.round((scenes.reduce((sum, s) => sum + s.durationInFrames, 0) / scenes.length / 30) * 10) / 10
      : 0,
    brandColor: cell.storyboard.videoConfig?.brandColor,
    bgm: cell.storyboard.videoConfig?.bgm,
    showWatermark: cell.storyboard.videoConfig?.showWatermark,
  };
}

// ---- write markdown report ----
const today = new Date().toISOString().slice(0, 10);
const suffix = includeFilter ? `-supplement-${Date.now()}` : '';
const reportPath = resolve(REPO_ROOT, `docs/dev-notes/intent-spectrum-${today}${suffix}.md`);
mkdirSync(dirname(reportPath), { recursive: true });

let md = `# Intent Spectrum Evaluation — ${today}\n\n`;
md += `9-job matrix: 3 URLs × 3 intents. Storyboard JSON captured the moment it was uploaded to S3 — render not awaited.\n\n`;

md += `## URLs (Y axis)\n\n`;
for (const u of URLS) md += `- **${u.id}** — ${u.label}: ${u.url}\n`;

md += `\n## Intents (X axis)\n\n`;
for (const i of INTENTS) md += `- **${i.id}** — ${i.label}\n  > ${i.text}\n`;

// Cell-level renderer guards against missing cells (INCLUDE_CELLS subset
// runs leave matrix[url][intent] undefined for filtered-out combos).
function renderCell(u, i, fmt) {
  const cell = matrix[u.id]?.[i.id];
  if (!cell) return '—'; // not requested in this run
  const s = summarize(cell);
  if (s.error) return `❌ ${formatErr(s.error).slice(0, 60)}`;
  return fmt(s);
}

md += `\n## Matrix 1: Scene Type Sequence\n\n`;
md += `| URL ↓ / Intent → | hardsell 🔥 | tech 🔬 | emotional 💫 |\n`;
md += `|---|---|---|---|\n`;
for (const u of URLS) {
  const cells = INTENTS.map((i) => renderCell(u, i, (s) => s.sceneTypes.join(' → ')));
  md += `| **${u.id}** | ${cells.join(' | ')} |\n`;
}

md += `\n## Matrix 2: Scene Count + Avg Pace\n\n`;
md += `| URL ↓ / Intent → | hardsell | tech | emotional |\n`;
md += `|---|---|---|---|\n`;
for (const u of URLS) {
  const cells = INTENTS.map((i) => renderCell(u, i, (s) => `${s.sceneCount} scenes / avg ${s.avgSceneDurSec}s`));
  md += `| **${u.id}** | ${cells.join(' | ')} |\n`;
}

md += `\n## Matrix 3: Brand Colour\n\n`;
md += `| URL ↓ / Intent → | hardsell | tech | emotional |\n`;
md += `|---|---|---|---|\n`;
for (const u of URLS) {
  const cells = INTENTS.map((i) => renderCell(u, i, (s) => s.brandColor ?? '—'));
  md += `| **${u.id}** | ${cells.join(' | ')} |\n`;
}

md += `\n## Per-Job Detail\n\n`;
for (const u of URLS) {
  for (const i of INTENTS) {
    const cell = matrix[u.id]?.[i.id];
    if (!cell) continue; // not requested in this run — skip the section entirely
    md += `### ${u.id} × ${i.id}\n\n`;
    md += `- jobId: \`${cell.jobId}\`\n`;
    if (cell.error) {
      md += `- ❌ ERROR: ${formatErr(cell.error)}\n\n`;
      continue;
    }
    const s = summarize(cell);
    md += `- scenes (${s.sceneCount}): ${s.sceneTypes.join(' → ')}\n`;
    md += `- avg pace: ${s.avgSceneDurSec}s/scene\n`;
    md += `- brandColor: ${s.brandColor}\n`;
    md += `- bgm: ${s.bgm}\n`;
    md += `- scene type histogram: ${JSON.stringify(s.sceneTypeCounts)}\n\n`;
    md += `<details><summary>First 2 scenes (props excerpt)</summary>\n\n`;
    md += `\`\`\`json\n${JSON.stringify(cell.storyboard.scenes.slice(0, 2), null, 2)}\n\`\`\`\n\n</details>\n\n`;
  }
}

writeFileSync(reportPath, md);
console.log(`\n[eval] report written to ${reportPath}`);

// ---- console summary ----
console.log('\n=== INTENT SPECTRUM MATRIX (Scene Type Sequence) ===\n');
const colWidth = 50;
const header = `URL ↓ / Intent →  | ${'hardsell 🔥'.padEnd(colWidth)} | ${'tech 🔬'.padEnd(colWidth)} | ${'emotional 💫'.padEnd(colWidth)} |`;
console.log(header);
console.log('-'.repeat(header.length));
for (const u of URLS) {
  const cells = INTENTS.map((i) => {
    const cell = matrix[u.id]?.[i.id];
    if (!cell) return '—'.padEnd(colWidth);
    const s = summarize(cell);
    return (s.error ? `❌ ${formatErr(s.error).slice(0, 30)}` : s.sceneTypes.join('→')).slice(0, colWidth).padEnd(colWidth);
  });
  console.log(`${u.id.padEnd(17)} | ${cells.join(' | ')} |`);
}
console.log('\n');
