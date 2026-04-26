# S-D: Migration Runner + Renumber Conflict

**Risk:** R2 — P0 (must fix before production DB management)  
**Date:** 2026-04-26  
**Status:** Approved — ready for implementation planning

---

## Problem

Two independent issues that must be fixed together:

**Issue 1 — Duplicate migration prefix:**
```
db/migrations/003_api_keys.sql
db/migrations/003_history_polish.sql   ← collision
```
Both carry the `003_` prefix. Any tool that applies migrations in lexicographic order will either skip one or apply them in an unpredictable sequence.

**Issue 2 — No migration runner:**
Migrations are executed once via Docker's `initdb.d` mechanism. This works for a fresh DB but provides no mechanism for applying incremental migrations to a live database. Any production DB update requires a manual SQL execution step with no audit trail.

---

## Approaches Considered

| Approach | Pros | Cons |
|---|---|---|
| **A) node-pg-migrate** ✅ | Minimal dep, pure SQL files, existing file format compatible, TypeScript-friendly | Less ecosystem than golang-migrate |
| B) drizzle-kit migrate | Integrated with Drizzle ORM if adopted (R3) | Requires full ORM adoption first; overkill standalone |
| C) golang-migrate | Language-agnostic binary, widely used | External binary dep; no native TS integration |
| D) Flyway | Mature, enterprise-grade | Heavy JVM dependency |

**Decision: A — node-pg-migrate.** It reads plain `.sql` files, requires no schema changes, fits the existing `db/migrations/` layout, and is already in the JS ecosystem. It does not require adopting Drizzle (R3 is a separate decision).

---

## Migration File Naming Convention

node-pg-migrate uses a timestamp prefix by default, but also supports sequential integer prefixes. We keep sequential to match the existing convention:

```
db/migrations/
  001_initial.sql
  002_pricing.sql
  003_api_keys.sql
  004_history_polish.sql    ← renamed from 003_history_polish.sql
```

**Rule going forward:** new migrations use the next available 3-digit prefix. The filename after the prefix is kebab-case describing the change.

---

## Architecture

**Migration runner as a standalone script** (not embedded in the API process):

```
package.json script:
  "db:migrate": "node-pg-migrate up --migrations-dir db/migrations"

CI / deploy pipeline:
  1. Run db:migrate before starting the API
  2. API starts only after exit code 0

Local dev:
  pnpm db:migrate   (replaces manual psql execution)
```

**node-pg-migrate tracks applied migrations** via a `pgmigrations` table it creates automatically in the target database. Each migration is applied exactly once; re-running `up` is a no-op if already applied.

**Migration file format compatibility:**

node-pg-migrate supports plain SQL files via `--migration-file-language sql`. No changes to existing `.sql` file contents required.

---

## Migration Table Bootstrap

node-pg-migrate creates its tracking table on first run:

```sql
-- Created automatically by node-pg-migrate
CREATE TABLE IF NOT EXISTS pgmigrations (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  run_on      TIMESTAMP NOT NULL
);
```

For existing DBs that already have all 3 prior migrations applied via `initdb.d`, the runner must be told they are already applied. Two options:

**Option A (recommended):** Run `node-pg-migrate up` against the existing DB — it detects that 001/002/003 tables already exist (each migration is idempotent due to `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`) and records them in `pgmigrations` without error.

**Option B:** Manually insert the existing migration names into `pgmigrations` before the first automated run. More surgical but requires a one-time manual step.

**Decision: Option A.** All existing migrations use `IF NOT EXISTS` guards, so re-applying them is safe.

---

## Files Changed

| File | Change |
|---|---|
| `db/migrations/003_history_polish.sql` | **Renamed** → `004_history_polish.sql` |
| `db/migrations/003_api_keys.sql` | **Unchanged** — keeps `003_` prefix (applied before `004_`) |
| `package.json` (root) | **Add** `"db:migrate"` script |
| `apps/api/package.json` | **Add** `node-pg-migrate` as dependency |
| `db/README.md` (new) | **New** — documents migration naming convention and runbook |
| `.github/workflows/` or deploy docs | **Update** — add `db:migrate` step before API startup |

---

## Rename Safety

`003_history_polish.sql` content:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_jobs_intent_trgm ...
```

Both statements are idempotent. Renaming to `004_` and re-applying against an existing DB that already ran it via `initdb.d` is safe — both statements are no-ops.

---

## Testing

- **Local dev:** `pnpm db:migrate` runs cleanly against the Docker Postgres from `pnpm infra:up`
- **CI:** migration step added before API integration tests that use a real DB
- **Idempotency test:** run `pnpm db:migrate` twice in succession — second run exits 0 with "no migrations to run"
- **New migration test:** add a dummy `005_test.sql`, run migrate, verify `pgmigrations` contains 5 rows, roll back manually

---

## Runbook (added to `db/README.md`)

```
Add a new migration:
  1. Create db/migrations/00N_description.sql (next sequential number)
  2. Use IF NOT EXISTS / IF EXISTS guards for idempotency
  3. Run pnpm db:migrate locally to verify
  4. Commit — CI applies it to staging before production deploy
```
