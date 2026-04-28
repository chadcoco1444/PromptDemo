#!/usr/bin/env node
/**
 * One-off helper: render 3 Vercel videos with different intents,
 * download the MP4 outputs into apps/landing/public/showcase/.
 *
 * Usage:  node scripts/render-showcase-videos.mjs
 *
 * Wall time: ~10-15 min (render worker concurrency=1, 3 jobs serial).
 * Cost: ~$0.30-0.50 for 3 Claude Sonnet storyboard calls.
 */

import { readFileSync, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

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

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function mintJwt(sub, ttlSec = 3600) {
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

// CLI args:  node scripts/render-showcase-videos.mjs <url> <filename-prefix>
// Examples:
//   node scripts/render-showcase-videos.mjs https://vercel.com vercel
//   node scripts/render-showcase-videos.mjs https://www.burton.com/ burton
const URL_TARGET = process.argv[2];
const FILENAME_PREFIX = process.argv[3];
if (!URL_TARGET || !FILENAME_PREFIX) {
  console.error('Usage: node scripts/render-showcase-videos.mjs <url> <filename-prefix>');
  process.exit(1);
}

const INTENTS = [
  { id: 'hardsell',  text: 'High-energy promotional spot. Short punchy scene durations. Emphasize speed, results, and aesthetic. Use a single powerful tagline. Tone: energetic, modern.' },
  { id: 'tech',      text: 'Calm, methodical product walkthrough for technical buyers. Show concrete features and capabilities in sequence. Highlight what the product actually does, not why it matters emotionally. Tone: confident, precise, no marketing fluff.' },
  { id: 'emotional', text: 'A romantic, atmospheric brand story. Slow scene pacing. Emphasize aspiration, lifestyle, who-you-become rather than what-the-product-does. Tone: cinematic, evocative, human.' },
];

const OUT_DIR = resolve(REPO_ROOT, 'apps/landing/public/showcase');
mkdirSync(OUT_DIR, { recursive: true });

async function submitJob(intent) {
  const res = await fetch(`${apiBase}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ url: URL_TARGET, intent: intent.text, duration: 30 }),
  });
  if (!res.ok) throw new Error(`POST failed for ${intent.id}: ${res.status} ${await res.text()}`);
  const { jobId } = await res.json();
  console.log(`  submitted ${intent.id} → ${jobId}`);
  return jobId;
}

async function pollUntilRendered(jobId, intentId) {
  const start = Date.now();
  let lastStage = null;
  while (true) {
    if (Date.now() - start > 12 * 60_000) throw new Error(`timeout for ${intentId} (${jobId})`);
    const r = await fetch(`${apiBase}/api/jobs/${jobId}`, { headers: auth });
    if (!r.ok) throw new Error(`GET ${jobId} failed: ${r.status}`);
    const job = await r.json();
    if (job.stage !== lastStage) {
      console.log(`  [${intentId}] stage=${job.stage} status=${job.status}`);
      lastStage = job.stage;
    }
    if (job.status === 'failed') throw new Error(`job ${jobId} failed: ${JSON.stringify(job.error)}`);
    if (job.status === 'done' && job.videoUrl) return job.videoUrl;
    await new Promise((res) => setTimeout(res, 4_000));
  }
}

async function downloadMp4(s3Uri, intentId) {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(s3Uri);
  if (!m) throw new Error(`bad S3 URI: ${s3Uri}`);
  const [, bucket, key] = m;
  const res = await fetch(`${minioBase}/${bucket}/${key}`);
  if (!res.ok) throw new Error(`MinIO GET failed: ${res.status}`);
  const dest = resolve(OUT_DIR, `${FILENAME_PREFIX}-${intentId}.mp4`);
  await pipeline(res.body, createWriteStream(dest));
  const sizeMb = (Number(res.headers.get('content-length') ?? 0) / 1024 / 1024).toFixed(2);
  console.log(`  ✓ saved ${dest} (${sizeMb} MB)`);
  return dest;
}

console.log(`[render] minting JWT, target=${apiBase}, output=${OUT_DIR}`);
for (const intent of INTENTS) {
  console.log(`\n=== ${intent.id} ===`);
  const jobId = await submitJob(intent);
  const outputUri = await pollUntilRendered(jobId, intent.id);
  await downloadMp4(outputUri, intent.id);
}
console.log(`\n[render] all 3 videos saved to ${OUT_DIR}`);
