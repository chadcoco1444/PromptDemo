/**
 * Feature 5 gate. Pricing enforcement hard-requires auth (anonymous users
 * have no user_id to key credits against), so PRICING_ENABLED=true with
 * AUTH_ENABLED=false is a misconfiguration.
 */
export function isPricingEnabled(): boolean {
  return process.env.PRICING_ENABLED === 'true' && process.env.AUTH_ENABLED === 'true';
}

export function assertPricingEnv(): void {
  if (process.env.PRICING_ENABLED !== 'true') return;
  if (process.env.AUTH_ENABLED !== 'true') {
    throw new Error(
      'PRICING_ENABLED=true requires AUTH_ENABLED=true — pricing needs per-user credit attribution. Set AUTH_ENABLED=true or flip PRICING_ENABLED off.',
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'PRICING_ENABLED=true requires DATABASE_URL — credit state lives in Postgres.',
    );
  }
}
