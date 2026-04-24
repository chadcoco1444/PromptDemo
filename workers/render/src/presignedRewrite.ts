import type { Storyboard } from '@promptdemo/schema';

export type UriSigner = (s3Uri: string) => Promise<string>;

type SignedStoryboard = Omit<Storyboard, 'assets' | 'videoConfig'> & {
  videoConfig: Omit<Storyboard['videoConfig'], 'logoUrl'> & { logoUrl?: string };
  assets: Omit<Storyboard['assets'], 'screenshots'> & {
    screenshots: { viewport?: string; fullPage?: string; byFeature?: Record<string, string> };
  };
};

export async function rewriteStoryboardUrls(
  sb: Storyboard,
  sign: UriSigner
): Promise<SignedStoryboard> {
  const out: SignedStoryboard = JSON.parse(JSON.stringify(sb));

  if (sb.videoConfig.logoUrl) {
    out.videoConfig.logoUrl = await sign(sb.videoConfig.logoUrl);
  }

  const src = sb.assets.screenshots;
  const dst = out.assets.screenshots;
  if (src.viewport) dst.viewport = await sign(src.viewport);
  if (src.fullPage) dst.fullPage = await sign(src.fullPage);
  if (src.byFeature) {
    dst.byFeature = {};
    for (const [k, v] of Object.entries(src.byFeature)) {
      dst.byFeature[k] = await sign(v);
    }
  }

  return out;
}

// Default signer using @aws-sdk/s3-request-presigner against the S3/GCS-interop endpoint
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { parseS3Uri } from '@promptdemo/schema';

export function defaultSigner(client: S3Client, ttlSeconds: number = 1800): UriSigner {
  return async (uri) => {
    const { bucket, key } = parseS3Uri(uri);
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttlSeconds });
  };
}
