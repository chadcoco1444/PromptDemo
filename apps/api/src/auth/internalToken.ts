import { jwtVerify, errors as joseErrors } from 'jose';

/**
 * Verify a JWT minted by the trusted Next.js BFF (apps/web's signInternalToken).
 *
 * Hard-coded issuer/audience so a token from any other context — even one
 * signed with the same secret for a different purpose — fails verification.
 * Returns the userId (sub claim) on success, null on any failure.
 *
 * The 30s clock skew tolerance covers minor server-clock drift between the
 * web tier and the api tier; tighter than the 60s exp so a leaked token
 * can't outlive its window.
 */
let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array | null {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.INTERNAL_API_SECRET;
  if (!raw || raw.length < 32) return null;
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

export interface VerifyResult {
  ok: boolean;
  userId?: string;
  reason?: 'no_secret' | 'no_token' | 'malformed' | 'invalid_signature' | 'expired' | 'wrong_issuer';
}

export async function verifyInternalToken(authHeader: string | undefined): Promise<VerifyResult> {
  const secret = getSecret();
  if (!secret) return { ok: false, reason: 'no_secret' };
  if (!authHeader) return { ok: false, reason: 'no_token' };
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!m) return { ok: false, reason: 'malformed' };
  const token = m[1]!;
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'promptdemo-web',
      audience: 'promptdemo-api',
      clockTolerance: 30,
    });
    if (!payload.sub) return { ok: false, reason: 'malformed' };
    return { ok: true, userId: payload.sub };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) return { ok: false, reason: 'expired' };
    if (err instanceof joseErrors.JWTClaimValidationFailed) return { ok: false, reason: 'wrong_issuer' };
    return { ok: false, reason: 'invalid_signature' };
  }
}
