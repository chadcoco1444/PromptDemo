import { createHash, randomBytes } from 'crypto';

/** Raw key format: lume_<32 base64url chars> — must match apps/api's apiKeyAuth.ts */
export function generateApiKey(): string {
  return 'lume_' + randomBytes(24).toString('base64url');
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/** First 12 chars shown in UI as identifier (e.g. "lume_kJ4mN8"). */
export function keyDisplayPrefix(rawKey: string): string {
  return rawKey.slice(0, 12);
}
