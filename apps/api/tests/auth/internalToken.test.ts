import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SignJWT } from 'jose';
import { verifyInternalToken } from '../../src/auth/internalToken.js';

const SECRET = 'a'.repeat(64);
const encoder = new TextEncoder();

async function mintToken(opts: {
  sub?: string;
  issuer?: string;
  audience?: string;
  expSeconds?: number;
  secret?: string;
} = {}): Promise<string> {
  const builder = new SignJWT({})
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(opts.sub ?? 'user-42')
    .setIssuedAt()
    .setIssuer(opts.issuer ?? 'lumespec-web')
    .setAudience(opts.audience ?? 'lumespec-api')
    .setExpirationTime(`${opts.expSeconds ?? 60}s`);
  return builder.sign(encoder.encode(opts.secret ?? SECRET));
}

describe('verifyInternalToken', () => {
  beforeEach(() => {
    delete (verifyInternalToken as any)._cache;
    process.env.INTERNAL_API_SECRET = SECRET;
    // Clear module-scoped cache by re-importing — vitest isolates module state per test file but
    // our cachedSecret is closure-scoped. The verifyInternalToken function reads env on first
    // call only. Setting env before each test with the same value keeps cache valid.
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_SECRET;
  });

  it('accepts a valid token and returns the sub claim as userId', async () => {
    const token = await mintToken({ sub: 'user-77' });
    const result = await verifyInternalToken(`Bearer ${token}`);
    expect(result).toEqual({ ok: true, userId: 'user-77' });
  });

  it('rejects when no Authorization header is present', async () => {
    const result = await verifyInternalToken(undefined);
    expect(result).toMatchObject({ ok: false, reason: 'no_token' });
  });

  it('rejects when the header lacks the Bearer scheme', async () => {
    const token = await mintToken();
    const result = await verifyInternalToken(token); // no `Bearer ` prefix
    expect(result).toMatchObject({ ok: false, reason: 'malformed' });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await mintToken({ secret: 'b'.repeat(64) });
    const result = await verifyInternalToken(`Bearer ${token}`);
    expect(result).toMatchObject({ ok: false, reason: 'invalid_signature' });
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await mintToken({ issuer: 'attacker' });
    const result = await verifyInternalToken(`Bearer ${token}`);
    expect(result.ok).toBe(false);
    expect(['wrong_issuer', 'invalid_signature']).toContain(result.reason);
  });

  it('rejects a token with the wrong audience', async () => {
    const token = await mintToken({ audience: 'someone-else' });
    const result = await verifyInternalToken(`Bearer ${token}`);
    expect(result.ok).toBe(false);
  });

  it('rejects a tampered token', async () => {
    const token = await mintToken();
    const tampered = token.slice(0, -3) + 'XYZ';
    const result = await verifyInternalToken(`Bearer ${tampered}`);
    expect(result).toMatchObject({ ok: false, reason: 'invalid_signature' });
  });
});
