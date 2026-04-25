import { S3Client } from '@aws-sdk/client-s3';

/**
 * Shared S3 client for Next.js server routes that proxy artifact bytes
 * (e.g. /api/jobs/[id]/cover). Same env-var contract as apps/api so MinIO
 * (dev) and real S3 (prod) both work.
 */
let _client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (_client) return _client;
  const opts: ConstructorParameters<typeof S3Client>[0] = {
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
  };
  if (process.env.S3_ENDPOINT) opts.endpoint = process.env.S3_ENDPOINT;
  if (process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY) {
    opts.credentials = {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    };
  }
  _client = new S3Client(opts);
  return _client;
}

export function getS3Bucket(): string {
  return process.env.S3_BUCKET ?? 'promptdemo';
}
