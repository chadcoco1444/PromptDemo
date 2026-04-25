import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { toS3Uri, type S3Uri } from '@lumespec/schema';
import { basename } from 'node:path/posix';

export function buildKey(jobId: string, filename: string): string {
  const safe = basename(filename.replace(/\\/g, '/'));
  return `jobs/${jobId}/${safe}`;
}

export interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export function makeS3Client(cfg: S3Config): S3Client {
  const opts: ConstructorParameters<typeof S3Client>[0] = {
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle,
  };
  if (cfg.endpoint) opts.endpoint = cfg.endpoint;
  if (cfg.accessKeyId && cfg.secretAccessKey) {
    opts.credentials = {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    };
  }
  // production: IAM role resolved from environment when credentials omitted
  return new S3Client(opts);
}

export async function putObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string
): Promise<S3Uri> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return toS3Uri(bucket, key);
}

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv): S3Config {
  const cfg: S3Config = {
    region: env.S3_REGION ?? 'us-east-1',
    bucket: env.S3_BUCKET ?? 'lumespec-dev',
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
  };
  if (env.S3_ENDPOINT) cfg.endpoint = env.S3_ENDPOINT;
  if (env.S3_ACCESS_KEY_ID) cfg.accessKeyId = env.S3_ACCESS_KEY_ID;
  if (env.S3_SECRET_ACCESS_KEY) cfg.secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  return cfg;
}
