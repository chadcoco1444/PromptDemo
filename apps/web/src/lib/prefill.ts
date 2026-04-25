/**
 * Submit-when-signed-out interception helpers. The marketing-page form
 * captures intent before the user has an account; we encode it onto the
 * sign-in callback URL so the post-OAuth landing page (/create) can
 * hydrate + auto-submit.
 *
 * Encoding: URL-safe base64 of JSON. Tested up to 500-char Chinese intent.
 * If we ever hit the 2KB callbackUrl ceiling in practice, swap for the
 * localStorage approach (see followup #pending-prefill-storage in spec).
 */
export interface Prefill {
  url: string;
  intent: string;
  duration: 10 | 30 | 60;
}

function urlSafeB64Encode(s: string): string {
  // btoa works on ASCII only — encode UTF-8 first.
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlSafeB64Decode(s: string): string | null {
  try {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodePrefill(p: Prefill): string {
  return urlSafeB64Encode(JSON.stringify(p));
}

export function decodePrefill(s: string): Prefill | null {
  if (!s) return null;
  const json = urlSafeB64Decode(s);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<Prefill>;
    if (typeof parsed.url !== 'string' || parsed.url.length === 0) return null;
    if (typeof parsed.intent !== 'string' || parsed.intent.length === 0) return null;
    if (parsed.duration !== 10 && parsed.duration !== 30 && parsed.duration !== 60) return null;
    return { url: parsed.url, intent: parsed.intent, duration: parsed.duration };
  } catch {
    return null;
  }
}

export function signInRedirectFor(p: Prefill): string {
  const prefill = encodePrefill(p);
  const callback = `/create?prefill=${prefill}`;
  return `/api/auth/signin?callbackUrl=${encodeURIComponent(callback)}`;
}
