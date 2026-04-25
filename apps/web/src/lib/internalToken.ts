import { SignJWT } from 'jose';

/**
 * Mint a 60-second HS256 JWT for the trusted Next.js → Fastify hop.
 *
 * Replaces the v1 `X-User-Id: <plain>` header which apps/api used to trust
 * unconditionally — anyone who could reach apps/api directly could forge
 * a userId. With the JWT we're guaranteed:
 *
 *   1. apps/api refuses requests without a valid signature (HS256 over
 *      INTERNAL_API_SECRET, which the browser never sees).
 *   2. Even if a token leaks, exp=60s makes replay windows tiny.
 *   3. The userId is in `sub`, immutable once signed.
 *
 * Throws synchronously if INTERNAL_API_SECRET is unset — fail loud so
 * misconfiguration is caught at boot, not silently downgraded to insecure.
 */
const TOKEN_TTL_SECONDS = 60;
let cachedSecret: Uint8Array | null = null;

function getSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.INTERNAL_API_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error(
      'INTERNAL_API_SECRET must be set to a value at least 32 chars long when AUTH_ENABLED=true. ' +
        'Generate via: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}

export async function signInternalToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuedAt()
    .setIssuer('lumespec-web')
    .setAudience('lumespec-api')
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}
