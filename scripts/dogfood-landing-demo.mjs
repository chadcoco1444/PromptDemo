#!/usr/bin/env node
/**
 * One-shot script to dogfood-render the marketing landing page hero video.
 *
 * Mints a JWT for an existing user (matches the v2.1 BFF flow), POSTs to
 * apps/api directly, polls until done, downloads the videoUrl from S3 to
 * docs/readme/landing-hero-demo.mp4.
 *
 * Usage:
 *   node scripts/dogfood-landing-demo.mjs [url] [intent] [duration]
 *
 * Defaults to vercel.com / 60s with a marketing-flavored intent.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');

// --- env loader (same heuristic as scripts/demo.mjs) ---
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

const url = process.argv[2] ?? 'https://vercel.com';
const intent = process.argv[3] ?? 'A high-energy marketing trailer that showcases the speed, power, and elegance of the platform. Fast cuts, bold visuals, end on the call-to-action.';
const duration = Number(process.argv[4] ?? '60');
const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';
const userId = process.env.DOGFOOD_USER_ID ?? '1';
const secret = process.env.INTERNAL_API_SECRET;
const outPath = resolve(REPO_ROOT, 'docs/readme/landing-hero-demo.mp4');

if (!secret) {
  console.error('INTERNAL_API_SECRET not set — load .env first');
  process.exit(1);
}

// --- mint JWT (HS256, same shape as apps/web/src/lib/internalToken.ts) ---
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function mintJwt(sub, ttlSec = 600) {
  // 10-minute TTL so the token survives a slow render queue
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: String(sub), iat: now, exp: now + ttlSec, iss: 'promptdemo-web', aud: 'promptdemo-api' };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}

const token = mintJwt(userId);
console.log(`[dogfood] minted JWT for user_id=${userId}`);
console.log(`[dogfood] target: ${url} (${duration}s)`);
console.log(`[dogfood] intent: ${intent}`);

// --- POST job ---
const postRes = await fetch(`${apiBase}/api/jobs`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ url, intent, duration }),
});
if (!postRes.ok) {
  console.error('[dogfood] POST failed:', postRes.status, await postRes.text());
  process.exit(1);
}
const { jobId } = await postRes.json();
console.log(`[dogfood] jobId=${jobId}`);

// --- poll until done ---
let job = null;
const start = Date.now();
let lastStage = null;
while (true) {
  if (Date.now() - start > 5 * 60_000) {
    console.error('[dogfood] timed out after 5 minutes');
    process.exit(1);
  }
  const r = await fetch(`${apiBase}/api/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    console.error('[dogfood] GET failed:', r.status, await r.text());
    process.exit(1);
  }
  job = await r.json();
  if (job.stage !== lastStage || job.status === 'failed') {
    process.stdout.write(`[dogfood] status=${job.status} stage=${job.stage}\n`);
    lastStage = job.stage;
  }
  if (job.status === 'done') break;
  if (job.status === 'failed') {
    console.error('[dogfood] job failed:', JSON.stringify(job.error));
    process.exit(1);
  }
  await new Promise((res) => setTimeout(res, 2000));
}

// --- download videoUrl (S3 URI like s3://bucket/key) → write to outPath ---
const videoUri = job.videoUrl;
if (!videoUri || !videoUri.startsWith('s3://')) {
  console.error('[dogfood] unexpected videoUrl:', videoUri);
  process.exit(1);
}
const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(videoUri);
const bucket = m[1];
const key = m[2];
console.log(`[dogfood] fetching ${videoUri} (bucket=${bucket}, key=${key})`);

// MinIO public path-style URL works without credentials in dev because we run
// path-style + the bucket policy from minio-init allows reads.
const minioBase = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const directUrl = `${minioBase}/${bucket}/${key}`;
const dlRes = await fetch(directUrl);
if (!dlRes.ok) {
  console.error('[dogfood] S3 GET failed:', dlRes.status, await dlRes.text());
  process.exit(1);
}

mkdirSync(dirname(outPath), { recursive: true });
const buf = Buffer.from(await dlRes.arrayBuffer());
writeFileSync(outPath, buf);
console.log(`[dogfood] wrote ${outPath} (${(buf.length / 1024).toFixed(1)} KB)`);
console.log(`[dogfood] elapsed: ${((Date.now() - start) / 1000).toFixed(1)}s`);
