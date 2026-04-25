-- LumeSpec v2.0 Feature 4 initial schema.
-- Runs once on first Postgres boot (docker-compose mounts /docker-entrypoint-initdb.d).
-- To rerun after schema changes: docker compose -f docker-compose.dev.yaml down -v && up -d.
--
-- Split into two concerns:
--   1. NextAuth required tables (users / accounts / sessions /
--      verification_token) — the @auth/pg-adapter queries them by exact
--      canonical shape. DO NOT rename columns or change types here.
--   2. LumeSpec domain tables (subscriptions / credits /
--      credit_transactions / jobs) — FK to users.id (INTEGER) as added on
--      top of the NextAuth users table.
--
-- Progress intentionally omitted from jobs per v2.0 Amendment A (Redis-only).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========== NextAuth required tables (@auth/pg-adapter) ==========

CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(255),
  email           VARCHAR(255) UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image           TEXT,
  -- LumeSpec extensions:
  preferences     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id                  SERIAL PRIMARY KEY,
  "userId"            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                VARCHAR(255) NOT NULL,
  provider            VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          BIGINT,
  id_token            TEXT,
  scope               TEXT,
  session_state       TEXT,
  token_type          TEXT
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts ("userId");

CREATE TABLE IF NOT EXISTS sessions (
  id             SERIAL PRIMARY KEY,
  "userId"       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires        TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions ("userId");

CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  token      TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- ========== LumeSpec domain tables ==========

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id                 INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier                    TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'max')) DEFAULT 'free',
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  current_period_end      TIMESTAMPTZ,
  status                  TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'canceled', 'paused')),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subs_stripe_customer ON subscriptions (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Balance denominated in render-SECONDS per v2.0 Amendment C (not credits —
-- user-visible math is seconds from day one).
CREATE TABLE IF NOT EXISTS credits (
  user_id          INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance          INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_refresh_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Immutable audit log for every credit movement.
CREATE TABLE IF NOT EXISTS credit_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id         TEXT,
  delta          INTEGER NOT NULL, -- negative = debit, positive = refund/refresh
  reason         TEXT NOT NULL CHECK (reason IN ('debit', 'refund', 'refresh', 'grant', 'overage')),
  balance_after  INTEGER NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_txn_user_time ON credit_transactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_job ON credit_transactions (job_id) WHERE job_id IS NOT NULL;

-- Jobs — replaces Redis job:<id> once dual-write + read-cutover both land.
-- Progress stays Redis-only per v2.0 Amendment A.
CREATE TABLE IF NOT EXISTS jobs (
  id                TEXT PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_job_id     TEXT REFERENCES jobs(id),
  status            TEXT NOT NULL CHECK (status IN (
    'queued','crawling','generating','waiting_render_slot','rendering','done','failed'
  )),
  stage             TEXT CHECK (stage IN ('crawl','storyboard','render')),
  input             JSONB NOT NULL,
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

-- ========== Updated-at triggers ==========

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
