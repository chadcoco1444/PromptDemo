-- PromptDemo v2.0 Feature 4 initial schema.
-- Runs once on first Postgres boot (docker-compose mounts /docker-entrypoint-initdb.d).
-- To rerun: docker compose -f docker-compose.dev.yaml down -v && up -d.
--
-- Schema tracks: users (from OAuth), subscriptions (tier + Stripe refs),
-- credits (balance in render-seconds — user-visible unit per v2.0 spec
-- Amendment C), credit_transactions (immutable audit log), and jobs (the
-- persisted job record — replaces the Redis job:<id> hash once we cut over).
--
-- Auth session rows are managed by NextAuth's @auth/pg-adapter using the
-- tables named `accounts`, `sessions`, and `verification_tokens` — those are
-- created at runtime by the adapter's init migration, not here.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT UNIQUE NOT NULL,
  email_verified  TIMESTAMPTZ,
  name            TEXT,
  image           TEXT,
  preferences     JSONB NOT NULL DEFAULT '{}'::jsonb, -- locale, theme, etc.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Subscriptions ---------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier                    TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'max')) DEFAULT 'free',
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  current_period_end      TIMESTAMPTZ,
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'paused')),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_stripe_customer ON subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Credits (balance denominated in render-seconds per v2.0 Amendment C) ----
CREATE TABLE IF NOT EXISTS credits (
  user_id          UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance          INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_refresh_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Credit transactions (immutable audit log) -----------------------
CREATE TABLE IF NOT EXISTS credit_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id         TEXT,
  delta          INTEGER NOT NULL, -- negative = debit, positive = refund/refresh
  reason         TEXT NOT NULL CHECK (reason IN ('debit', 'refund', 'refresh', 'grant', 'overage')),
  balance_after  INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_txn_user_time ON credit_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_job ON credit_transactions (job_id) WHERE job_id IS NOT NULL;

-- Jobs (replaces Redis job:<id> hash once AUTH_ENABLED + READ_FROM_POSTGRES are both true) ----
CREATE TABLE IF NOT EXISTS jobs (
  id                TEXT PRIMARY KEY, -- existing nanoid format
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_job_id     TEXT REFERENCES jobs(id),
  status            TEXT NOT NULL CHECK (status IN (
    'queued','crawling','generating','waiting_render_slot','rendering','done','failed'
  )),
  stage             TEXT CHECK (stage IN ('crawl','storyboard','render')),
  input             JSONB NOT NULL, -- { url, intent, duration, hint?, parentJobId? }
  crawl_result_uri  TEXT,
  storyboard_uri    TEXT,
  video_url         TEXT,
  thumb_url         TEXT,
  fallbacks         JSONB NOT NULL DEFAULT '[]'::jsonb,
  error             JSONB,
  credits_charged   SMALLINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_user_created ON jobs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status_updated ON jobs (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_parent ON jobs (parent_job_id) WHERE parent_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_intent_fts ON jobs USING GIN (to_tsvector('english', input->>'intent'));

-- NOTE: `progress %` intentionally lives in Redis only (per v2.0 Amendment A).
-- Render workers emit ~5 progress updates/sec; writing those to Postgres would
-- produce WAL storms. The `jobs` table records status/stage transitions only.

-- Updated-at trigger helpers for pgx/drizzle/etc. --------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_touch_updated_at ON users;
CREATE TRIGGER users_touch_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS subscriptions_touch_updated_at ON subscriptions;
CREATE TRIGGER subscriptions_touch_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS credits_touch_updated_at ON credits;
CREATE TRIGGER credits_touch_updated_at BEFORE UPDATE ON credits
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS jobs_touch_updated_at ON jobs;
CREATE TRIGGER jobs_touch_updated_at BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
