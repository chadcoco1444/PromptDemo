-- Feature 6: Direct API access for Max-tier users.
--
-- API keys are long-lived bearer tokens minted in apps/web and verified in
-- apps/api. The raw key is shown to the user ONCE at creation time; only a
-- SHA-256 hash is stored, so even a full DB dump cannot replay keys.
--
-- Key format: lume_<32 base64url chars>  (37 chars total)
-- Hash stored: hex-encoded SHA-256 of the raw key

CREATE TABLE IF NOT EXISTS api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash     TEXT        NOT NULL UNIQUE,
  key_prefix   TEXT        NOT NULL,    -- first 12 chars shown in UI (e.g. "lume_kJ4mN8")
  name         TEXT        NOT NULL DEFAULT 'My API Key',
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ             -- null = active; non-null = soft-deleted
);

-- Index for hot read path: bearer token → user+tier lookup
CREATE INDEX IF NOT EXISTS idx_api_keys_hash_active   ON api_keys (key_hash)  WHERE revoked_at IS NULL;
-- Index for key-management listing per user
CREATE INDEX IF NOT EXISTS idx_api_keys_user_active   ON api_keys (user_id)   WHERE revoked_at IS NULL;
