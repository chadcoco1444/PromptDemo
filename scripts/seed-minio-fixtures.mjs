/**
 * Seed placeholder fixture images into local MinIO for dev/test.
 *
 * Uploads minimal solid-color JPEGs at the paths referenced by
 * packages/schema/fixtures/crawlResult.saas-landing.json so the
 * History page and preview UI don't show broken images locally.
 *
 * Usage:
 *   node scripts/seed-minio-fixtures.mjs
 *
 * Requires MinIO running at localhost:9000 (docker compose up minio).
 */

import { S3Client, PutObjectCommand, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';

const ENDPOINT = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
const BUCKET   = process.env.S3_BUCKET    ?? 'lumespec-dev';
const AK       = process.env.S3_ACCESS_KEY_ID     ?? 'minioadmin';
const SK       = process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin';

const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: AK, secretAccessKey: SK },
});

// Minimal 1×1 white JPEG — valid enough for <img> / Next Image to render.
// Generated with: convert -size 1x1 xc:white /tmp/px.jpg | base64
const WHITE_PX_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDB' +
  'kSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAAR' +
  'CAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAA' +
  'AAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAA' +
  'AAAAAAAA/9oADAMBAAIRAxEAPwCwABmX/9k=',
  'base64',
);

// Fixture files to seed
const FILES = [
  { key: 'fixtures/saas-viewport.jpg',  body: WHITE_PX_JPEG, type: 'image/jpeg' },
  { key: 'fixtures/saas-full.jpg',      body: WHITE_PX_JPEG, type: 'image/jpeg' },
  { key: 'fixtures/saas-logo.png',      body: WHITE_PX_JPEG, type: 'image/png'  },
];

async function ensureBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    console.log(`Bucket "${BUCKET}" already exists.`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
    console.log(`Bucket "${BUCKET}" created.`);
  }
}

async function run() {
  await ensureBucket();
  for (const f of FILES) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: f.key,
      Body: f.body,
      ContentType: f.type,
    }));
    console.log(`  ✓  ${BUCKET}/${f.key}`);
  }
  console.log('Done. Restart Next.js if it was already running.');
}

run().catch((err) => { console.error(err); process.exit(1); });
