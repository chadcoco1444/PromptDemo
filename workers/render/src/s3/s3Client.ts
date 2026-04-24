import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { toS3Uri, parseS3Uri, type S3Uri } from '@promptdemo/schema';
import { basename } from 'node:path/posix';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

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
    bucket: env.S3_BUCKET ?? 'promptdemo-dev',
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
  };
  if (env.S3_ENDPOINT) cfg.endpoint = env.S3_ENDPOINT;
  if (env.S3_ACCESS_KEY_ID) cfg.accessKeyId = env.S3_ACCESS_KEY_ID;
  if (env.S3_SECRET_ACCESS_KEY) cfg.secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  return cfg;
}

export async function getObjectJson<T>(client: S3Client, uri: string): Promise<T> {
  const { bucket, key } = parseS3Uri(uri);
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await res.Body?.transformToString('utf8');
  if (!body) throw new Error(`empty S3 object at ${uri}`);
  return JSON.parse(body) as T;
}

export async function uploadFile(
  client: S3Client,
  bucket: string,
  key: string,
  localPath: string,
  contentType: string
): Promise<S3Uri> {
  const size = (await stat(localPath)).size;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentLength: size,
      ContentType: contentType,
    })
  );
  return toS3Uri(bucket, key);
}
