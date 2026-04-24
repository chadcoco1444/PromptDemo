-- Feature 5 Pricing + Credits.
-- Runs AFTER 001_initial.sql (alphabetical filename order).
--
-- Scope:
--   1. system_limits  — runtime-adjustable knobs (Anthropic daily cap, etc.)
--   2. Seed a default Anthropic daily limit
--   3. Seed free-tier credits for any existing user records (local dev only
--      — prod will do this via the NextAuth `createUser` callback in
--      apps/web/src/auth.ts)
--
-- The pricing tables themselves (subscriptions, credits, credit_transactions)
-- already exist in 001_initial.sql — we just seed them here.

-- Runtime-adjustable system knobs. Key/value so ops can UPDATE without
-- schema migrations. Reads are hot-cached in apps/api.
CREATE TABLE IF NOT EXISTS system_limits (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  description  TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Stripe event idempotency — we persist every processed event_id so webhook
-- replays during redeploys are safe. TTL via a retention job; for now we just
-- keep them all (rows are tiny).
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id     TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload      JSONB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events (type, processed_at DESC);

-- Seed the Anthropic daily limit. Conservative default of $25/day (tracks
-- test-mode spending); flip in prod via UPDATE system_limits ....
INSERT INTO system_limits (key, value, description)
VALUES
  ('anthropic_daily_limit_usd',  '25',  'Hard stop for storyboard worker when the running daily total exceeds this. Reset at UTC midnight by a cron (not yet built — tracked as followup).'),
  ('anthropic_daily_spend_usd',  '0',   'Running total for today. Storyboard worker increments after each Claude call using the usage block from the API response.'),
  ('anthropic_daily_reset_at',   'now', 'UTC midnight marker — when the spending key is older than this, reset spend to 0 before the next check.')
ON CONFLICT (key) DO NOTHING;

-- Trigger to keep updated_at fresh on system_limits.
DROP TRIGGER IF EXISTS system_limits_touch_updated_at ON system_limits;
CREATE TRIGGER system_limits_touch_updated_at BEFORE UPDATE ON system_limits
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Index for concurrency check (the hot query in the debit transaction):
--   SELECT count(*) FROM jobs WHERE user_id = $1 AND status IN (...active)
CREATE INDEX IF NOT EXISTS idx_jobs_user_active
  ON jobs (user_id)
  WHERE status IN ('queued','crawling','generating','waiting_render_slot','rendering');
