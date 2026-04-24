/**
 * Feature 4 gate. Every auth-dependent code path reads this before invoking
 * NextAuth or touching Postgres so the web app stays fully functional for
 * users who haven't configured OAuth creds + AUTH_SECRET + DATABASE_URL yet.
 *
 * Server-side this reads AUTH_ENABLED; client components can call this too
 * but the value only reflects the BUILD-TIME env since Next.js doesn't pipe
 * arbitrary env vars into the client bundle. For client-visible gating use
 * a NEXT_PUBLIC_* flag or an API probe — the current UI gates by rendering
 * the auth button only if `session` is available (server-rendered).
 */
export function isAuthEnabled(): boolean {
  return process.env.AUTH_ENABLED === 'true';
}

/**
 * Fail fast if any required auth env var is missing when AUTH_ENABLED=true.
 * Called from auth.ts during module load so the problem surfaces at startup,
 * not at first sign-in attempt.
 */
export function assertAuthEnv(): void {
  if (!isAuthEnabled()) return;
  const required = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTH_SECRET', 'DATABASE_URL'] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `AUTH_ENABLED=true but the following env vars are missing: ${missing.join(', ')}. ` +
      `Either set them or flip AUTH_ENABLED=false. See .env.example.`
    );
  }
}
