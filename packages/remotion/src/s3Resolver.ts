import { parseS3Uri } from '@promptdemo/schema';

export interface S3ResolverConfig {
  endpoint: string; // http(s)://host[:port]
  forcePathStyle: boolean;
}

export type S3Resolver = (uri: string | undefined) => string | undefined;

export function makeS3Resolver(cfg: S3ResolverConfig): S3Resolver {
  return (uri) => {
    if (!uri) return undefined;
    if (!uri.startsWith('s3://')) return uri;
    const { bucket, key } = parseS3Uri(uri);
    const u = new URL(cfg.endpoint);
    if (cfg.forcePathStyle) {
      return `${cfg.endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    }
    return `${u.protocol}//${bucket}.${u.host}/${key}`;
  };
}
