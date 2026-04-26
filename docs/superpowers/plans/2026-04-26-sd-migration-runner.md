# S-D: Migration Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-shot Docker initdb.d migration mechanism with `node-pg-migrate` so incremental migrations can be applied to live databases safely and repeatably.

**Architecture:** `node-pg-migrate` reads plain `.sql` files from `db/migrations/` in alphabetical order, tracks applied migrations in a `pgmigrations` table, and is invoked via a root-level `pnpm db:migrate` script. The existing SQL files are unchanged in content; only `003_history_polish.sql` is renamed to `004_` to resolve the duplicate prefix collision.

**Tech Stack:** `node-pg-migrate` (npm), pnpm workspace scripts, PostgreSQL 16.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `db/migrations/003_history_polish.sql` | Rename → `004_history_polish.sql` | Fix duplicate `003_` prefix |
| `db/migrations/003_api_keys.sql` | Unchanged | Keeps `003_` (runs before `004_`) |
| `package.json` (root) | Modify | Add `node-pg-migrate` devDep + `db:migrate` script |
| `db/README.md` | Create | Migration runbook and naming convention |

---

## Task 1: Rename the Conflicting Migration File

**Files:**
- Rename: `db/migrations/003_history_polish.sql` → `db/migrations/004_history_polish.sql`

- [ ] **Step 1: Rename the file**

```bash
git mv db/migrations/003_history_polish.sql db/migrations/004_history_polish.sql
```

- [ ] **Step 2: Verify the migrations directory now has no duplicate prefixes**

```bash
ls db/migrations/
```

Expected output (alphabetical, no two files sharing the same numeric prefix):
```
001_initial.sql
002_pricing.sql
003_api_keys.sql
004_history_polish.sql
```

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(migrations): rename 003_history_polish → 004 to resolve prefix collision"
```

---

## Task 2: Install node-pg-migrate and Add the db:migrate Script

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Install node-pg-migrate at the workspace root**

```bash
pnpm add -D -w node-pg-migrate
```

Expected: `node-pg-migrate` added to root `package.json` devDependencies.

- [ ] **Step 2: Add the `db:migrate` script to root `package.json`**

Open `package.json` and add `db:migrate` to the `scripts` block. The full updated scripts section:

```json
"scripts": {
  "build": "pnpm -r run build",
  "test": "pnpm -r run test",
  "typecheck": "pnpm -r run typecheck",
  "lint": "pnpm -r run lint",
  "infra:up": "docker compose -f docker-compose.dev.yaml up -d",
  "infra:down": "docker compose -f docker-compose.dev.yaml down",
  "infra:check": "node scripts/infra-check.mjs",
  "lume": "node scripts/lume.mjs",
  "test:scripts": "pnpm --filter @lumespec-internal/scripts test",
  "a11y": "node scripts/check-a11y.mjs",
  "db:migrate": "node-pg-migrate up --migrations-dir db/migrations --migration-file-language sql"
}
```

The `DATABASE_URL` environment variable must be set before running. `node-pg-migrate` reads it automatically.

- [ ] **Step 3: Verify the script is discoverable**

```bash
pnpm db:migrate --help
```

Expected: node-pg-migrate prints its help text (or exits with usage info). This confirms the binary resolves correctly from the workspace root.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "feat(db): add node-pg-migrate + pnpm db:migrate script"
```

---

## Task 3: Verify Migration Runner Works Against Local Postgres

**Prerequisites:** Docker Postgres must be running (`pnpm infra:up`).

- [ ] **Step 1: Bring up the local DB (fresh volume to test from zero)**

```bash
pnpm infra:down
docker volume rm lumespec_postgres-data 2>/dev/null || true
pnpm infra:up
```

Wait ~5s for the healthcheck to pass, then verify Postgres is ready:

```bash
docker compose -f docker-compose.dev.yaml ps
```

Expected: `postgres` service shows `healthy`.

- [ ] **Step 2: Run the migration runner against the fresh DB**

```bash
DATABASE_URL=postgres://lumespec:lumespec@localhost:5432/lumespec pnpm db:migrate
```

Expected output (node-pg-migrate applies all 4 migrations):
```
> node-pg-migrate up ...
[2026-04-26T...] Migrating files:
[2026-04-26T...] > 001_initial
[2026-04-26T...] > 002_pricing
[2026-04-26T...] > 003_api_keys
[2026-04-26T...] > 004_history_polish
[2026-04-26T...] Migrations complete!
```

- [ ] **Step 3: Verify idempotency — run again, expect no-op**

```bash
DATABASE_URL=postgres://lumespec:lumespec@localhost:5432/lumespec pnpm db:migrate
```

Expected output:
```
No migrations to run!
```

Exit code must be `0` (not an error). Confirm:

```bash
echo "Exit code: $?"
```

Expected: `Exit code: 0`

- [ ] **Step 4: Verify the pgmigrations tracking table**

```bash
docker exec -it $(docker compose -f docker-compose.dev.yaml ps -q postgres) \
  psql -U lumespec -d lumespec -c "SELECT name, run_on FROM pgmigrations ORDER BY id;"
```

Expected: 4 rows, one per migration file, in order.

```
       name            |          run_on
-----------------------+----------------------------
 001_initial           | 2026-04-26 ...
 002_pricing           | 2026-04-26 ...
 003_api_keys          | 2026-04-26 ...
 004_history_polish    | 2026-04-26 ...
(4 rows)
```

- [ ] **Step 5: Test that the runner handles an existing DB (Option A from spec)**

Simulate an existing production DB that already has the schema but no `pgmigrations` table:

```bash
# Drop just the tracking table to simulate a pre-existing DB
docker exec -it $(docker compose -f docker-compose.dev.yaml ps -q postgres) \
  psql -U lumespec -d lumespec -c "DROP TABLE pgmigrations;"

# Re-run — all migrations use IF NOT EXISTS so re-applying is safe
DATABASE_URL=postgres://lumespec:lumespec@localhost:5432/lumespec pnpm db:migrate
```

Expected: node-pg-migrate recreates `pgmigrations`, re-runs all 4 migrations (all `IF NOT EXISTS` statements are no-ops), exits 0.

---

## Task 4: Write db/README.md Runbook

**Files:**
- Create: `db/README.md`

- [ ] **Step 1: Create the file**

Create `db/README.md` with this content:

```markdown
# Database Migrations

Migrations are managed with [node-pg-migrate](https://salsita.github.io/node-pg-migrate/).

## Running Migrations

```bash
DATABASE_URL=postgres://lumespec:lumespec@localhost:5432/lumespec pnpm db:migrate
```

In CI / production, `DATABASE_URL` is set as an environment variable. Run `pnpm db:migrate` **before** starting the API process.

## Adding a New Migration

1. Determine the next sequential number (e.g. if `004_history_polish.sql` exists, next is `005`).
2. Create `db/migrations/005_short_description.sql`.
3. Use `IF NOT EXISTS` / `IF EXISTS` guards on every statement so re-running is safe.
4. Run `pnpm db:migrate` locally to verify.
5. Commit. CI applies the migration to staging before production deploy.

## File Naming Convention

```
NNN_short_description.sql
```

- `NNN` — zero-padded 3-digit sequential integer (001, 002, … 099, 100, …)
- `short_description` — lowercase kebab-case describing the change
- No timestamps — keep names stable across environments

## Current Migrations

| File | Contents |
|---|---|
| `001_initial.sql` | NextAuth tables, users, subscriptions, credits, jobs |
| `002_pricing.sql` | Credit ledger, concurrency tracking |
| `003_api_keys.sql` | API keys table for Max-tier direct access |
| `004_history_polish.sql` | pg_trgm extension + GIN index for intent full-text search |

## Idempotency Rule

Every migration must be safe to re-run. Use:
- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- `CREATE EXTENSION IF NOT EXISTS`
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- `DROP TABLE IF EXISTS`

## Local Dev Reset

To wipe the DB and re-run all migrations from scratch (destructive — local only):

```bash
pnpm infra:down
docker volume rm lumespec_postgres-data
pnpm infra:up
DATABASE_URL=postgres://lumespec:lumespec@localhost:5432/lumespec pnpm db:migrate
```
```

- [ ] **Step 2: Commit**

```bash
git add db/README.md
git commit -m "docs(db): add migration runbook to db/README.md"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Confirm clean git state**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

- [ ] **Step 2: Confirm migration files are in correct order**

```bash
ls db/migrations/
```

Expected:
```
001_initial.sql
002_pricing.sql
003_api_keys.sql
004_history_polish.sql
```

No `003_history_polish.sql` present.

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
pnpm test
```

Expected: all 354 tests pass (S-D touches no application code, only migration files and config).

- [ ] **Step 4: Final commit summary**

Verify the commit log covers the three distinct changes:
```bash
git log --oneline -4
```

Expected (top 3 commits are from this plan):
```
<hash> docs(db): add migration runbook to db/README.md
<hash> feat(db): add node-pg-migrate + pnpm db:migrate script
<hash> fix(migrations): rename 003_history_polish → 004 to resolve prefix collision
```

---

## Self-Review Against Spec

| Spec requirement | Task |
|---|---|
| Rename `003_history_polish.sql` → `004_history_polish.sql` | Task 1 |
| Add `node-pg-migrate` dependency | Task 2 Step 1 |
| Add `db:migrate` root script | Task 2 Step 2 |
| Verify idempotency (Option A: IF NOT EXISTS re-run) | Task 3 Step 3 + 5 |
| Create `db/README.md` with naming convention + runbook | Task 4 |
| Verify `pgmigrations` tracking table exists after run | Task 3 Step 4 |
| All existing tests continue to pass | Task 5 Step 3 |
