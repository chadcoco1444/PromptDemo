import { z } from 'zod';

export const S3UriSchema = z
  .string()
  .refine((v) => /^s3:\/\/[^/]+\/.+/.test(v), {
    message: 'must be s3://<bucket>/<key>',
  })
  .brand<'S3Uri'>();

export type S3Uri = z.infer<typeof S3UriSchema>;

export function parseS3Uri(uri: string): { bucket: string; key: string } {
  const parsed = S3UriSchema.parse(uri);
  const rest = (parsed as unknown as string).slice('s3://'.length);
  const idx = rest.indexOf('/');
  return { bucket: rest.slice(0, idx), key: rest.slice(idx + 1) };
}

export function toS3Uri(bucket: string, key: string): S3Uri {
  return S3UriSchema.parse(`s3://${bucket}/${key}`) as S3Uri;
}
