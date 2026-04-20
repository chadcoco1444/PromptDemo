#!/usr/bin/env node
// Quick pre-flight check for dev infra. Exits non-zero if any dependency is down.
import { createConnection } from 'node:net';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

const checks = [];

function checkTcp(name, host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port });
    let done = false;
    const finish = (ok, msg) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ name, ok, msg });
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true, `reachable at ${host}:${port}`));
    sock.once('timeout', () => finish(false, `timeout after ${timeoutMs}ms`));
    sock.once('error', (err) => finish(false, err.message));
  });
}

async function checkMinioBucket() {
  const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
  const bucket = process.env.S3_BUCKET ?? 'promptdemo-dev';
  const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
    },
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return { name: 'MinIO bucket', ok: true, msg: `${endpoint}/${bucket} exists` };
  } catch (err) {
    return { name: 'MinIO bucket', ok: false, msg: err.message };
  }
}

async function main() {
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  checks.push(await checkTcp('Redis', redisUrl.hostname, Number(redisUrl.port || 6379)));
  checks.push(await checkMinioBucket());

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? 'OK  ' : 'FAIL';
    console.log(`  [${mark}] ${c.name}: ${c.msg}`);
    if (!c.ok) failed++;
  }
  if (failed > 0) {
    console.error(`\n${failed} dependency check(s) failed. Run: pnpm infra:up`);
    process.exit(1);
  }
  console.log('\nAll infra checks passed.');
}

main().catch((err) => {
  console.error('[infra:check] unexpected error:', err);
  process.exit(2);
});
