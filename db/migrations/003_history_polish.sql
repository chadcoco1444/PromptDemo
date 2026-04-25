-- v2.2 History Page Polish — server-side full-text search on intent.
-- pg_trgm provides bilingual (CJK + Latin) substring matching via 3-char
-- n-grams; GIN index makes ILIKE '%term%' fast on (input->>'intent').
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_jobs_intent_trgm
  ON jobs USING gin ((input->>'intent') gin_trgm_ops);
