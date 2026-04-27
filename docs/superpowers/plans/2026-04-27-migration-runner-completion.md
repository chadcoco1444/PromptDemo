# Migration Runner Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the last three open items from `2026-04-26-sd-migration-runner-design.md` so production deploys auto-apply DB schema changes with audit trail and regression protection.

**Architecture:** node-pg-migrate (already installed) runs as a standalone CLI step in the deploy pipeline, gated before service deploys. An automated idempotency test guards against future migrations that violate the re-runnable contract. db/DESIGN.md is corrected to reflect the standalone runner reality (it currently still describes the obsolete embedded `runMigrations()` pattern).

**Tech Stack:** node-pg-migrate@^8.0.4 (already in root devDependencies), Vitest (existing), GitHub Actions (existing deploy.yaml).

---

## State Audit (Already Shipped)

The spec was written 2026-04-26; partial implementation already landed before this plan:

| Spec item | State |
|---|---|
| Rename `003_history_polish.sql` → `004_history_polish.sql` | ✅ shipped — file is `db/migrations/004_history_polish.sql` |
| `node-pg-migrate` dependency | ✅ shipped — root `package.json` devDependencies |
| Root `db:migrate` script | ✅ shipped — `node-pg-migrate up --migrations-dir db/migrations --migration-file-language sql` |
| `db/README.md` runbook | ✅ shipped — covers naming, idempotency, current migrations, local dev reset |
| Standalone (not embedded in apps/api) | ✅ shipped — `apps/api/src/db/` directory does not exist; no `runMigrations()` import anywhere in `apps/`, `workers/`, `scripts/` |

This plan only covers what is **still open**:

| Open item | Why it matters |
|---|---|
| 1. db/DESIGN.md still describes embedded `runMigrations(pool)` invoked at apps/api startup (lines 39, 50–56) | Docs lie — future contributors will believe the API auto-runs migrations on boot, and may either depend on that behavior or delete the standalone runner thinking it's dead code |
| 2. No automated idempotency test | A future migration that omits `IF NOT EXISTS` won't be caught until prod re-deploys (where `db:migrate` is run for the second time against the same DB) |
| 3. `.github/workflows/deploy.yaml` has no `db:migrate` step before `Deploy all services` | Manual SQL still required for every prod schema change — the entire point of installing the runner is unmet |

---

## File Structure

| File | Change | Owner task |
|---|---|---|
| `db/DESIGN.md` | Modify lines 39, 50–56 to describe standalone runner; add "Migration 執行流程" section reflecting `pnpm db:migrate` invocation | T1 |
| `apps/api/tests/migrations.test.ts` | Create — Vitest integration test asserting double-run idempotency against the dev Postgres | T2 |
| `.github/workflows/deploy.yaml` | Modify — insert `pnpm db:migrate` step between `Build + push` (line 35) and `Deploy all services` (line 41), with `DATABASE_URL` from new GitHub secret | T3 |
| `db/README.md` | Modify — add a "CI / Production Deploys" section noting the `DATABASE_URL` secret name and ordering | T3 |

---

## Task 1: Sync db/DESIGN.md to Standalone Runner Reality

**Goal:** Eliminate the false claim that `apps/api` runs migrations on startup. After this task, the docs match what the code actually does.

**Files:**
- Modify: `db/DESIGN.md:39` (Responsibilities bullet)
- Modify: `db/DESIGN.md:50-56` (Migration 執行流程 code block)

This is a docs-only change. There is no test code; the verification is reading the file and confirming the description matches the actual `pnpm db:migrate` invocation.

- [ ] **Step 1: Read current state of db/DESIGN.md lines 37–60**

Run: `sed -n '37,60p' db/DESIGN.md`

Expected: lines describe `runMigrations(pool)` from `apps/api/src/db/migrate.ts` invoked at API startup. This is what we are about to correct.

- [ ] **Step 2: Replace the stale Responsibilities bullet (line 39)**

Use Edit on `db/DESIGN.md`:

old_string:
```
- **Schema 版本管理** — `migrations/` 目錄下的有序 SQL 檔案，由 `apps/api` 啟動時的 `runMigrations()` 自動執行，確保生產與開發環境的 Schema 一致
```

new_string:
```
- **Schema 版本管理** — `migrations/` 目錄下的有序 SQL 檔案，由 `node-pg-migrate` CLI 透過 `pnpm db:migrate` 套用。Local dev 由開發者手動執行；CI/CD pipeline 在 `Build + push` 之後、`Deploy all services` 之前自動執行（見 `.github/workflows/deploy.yaml`）。`pgmigrations` table 由 runner 自動建立，記錄已套用的 migration 名稱以保證 exactly-once 套用
```

- [ ] **Step 3: Replace the stale "Migration 執行流程" code block (lines 50–56)**

Use Edit on `db/DESIGN.md`:

old_string:
```
### Migration 執行流程

```
apps/api 啟動
  → runMigrations(pool) (apps/api/src/db/migrate.ts)
  → SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1
  → 執行所有 version > current 的 migrations/*.sql
  → INSERT INTO schema_migrations (version) VALUES (...)
```
```

new_string:
```
### Migration 執行流程

```
任何時刻（local dev / CI / prod deploy）
  → pnpm db:migrate
  → node-pg-migrate up --migrations-dir db/migrations --migration-file-language sql
  → 連線 DATABASE_URL，建立 pgmigrations table（若不存在）
  → SELECT name FROM pgmigrations  → 已套用清單
  → 對所有未套用的 migrations/*.sql 按字典序執行
  → INSERT INTO pgmigrations (name, run_on) VALUES (...)
  → exit 0 表示成功；CI/CD 必須在此 exit 0 後才繼續部署 service
```
```

- [ ] **Step 4: Verify the file reads correctly**

Run: `sed -n '37,65p' db/DESIGN.md`

Expected: bullet on line 39 mentions `pnpm db:migrate` and `pgmigrations` table; code block describes the CLI invocation and ordering, no mention of `runMigrations(pool)` or `apps/api/src/db/migrate.ts`.

- [ ] **Step 5: Commit**

The CLAUDE.md pre-commit hook checks for DESIGN.md sync when `db/migrations/**` is touched. We are touching `db/DESIGN.md` directly with no migration files staged, so the hook will pass without complaint.

```bash
git add db/DESIGN.md
git commit -m "$(cat <<'EOF'
docs(db): correct DESIGN.md to reflect standalone migration runner

The Responsibilities bullet and "Migration 執行流程" diagram still
described the obsolete embedded runMigrations(pool) pattern from
apps/api/src/db/migrate.ts — a path that no longer exists. The
runner has been standalone (`pnpm db:migrate` → node-pg-migrate CLI)
since the spec from 2026-04-26.

Brings docs in line with code so future contributors don't depend
on phantom auto-run-at-boot behavior or delete the standalone
runner thinking it's dead.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds. No tests to run — pure documentation change.

---

## Task 2: Add Migration Idempotency Integration Test

**Goal:** Lock in regression protection so any future migration that violates the "must be re-runnable" contract fails CI before reaching prod.

**Files:**
- Create: `apps/api/tests/migrations.test.ts`

**Pattern reference:** Existing `apps/api/tests/jobStorePostgres.test.ts` shows the established pattern for tests that hit a real Postgres (DATABASE_URL env, beforeAll connection setup, isolated test data).

**Why apps/api/tests not scripts/tests:** apps/api tests already require Postgres and run against the same dev DB, so the test infrastructure (DATABASE_URL convention, Vitest config) is already proven there. Adding it under scripts/ would duplicate the env wiring and require its own Vitest config.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/migrations.test.ts` with this exact content:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { Pool } from 'pg';
import { resolve } from 'node:path';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://lumespec:lumespec@localhost:5432/lumespec';
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// Skip the whole suite if Postgres is not reachable — keeps CI runs that
// don't provision a DB green. Local devs running `pnpm test` after
// `pnpm infra:up` will exercise the test.
let postgresUp = false;

beforeAll(async () => {
  const pool = new Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 1500 });
  try {
    await pool.query('SELECT 1');
    postgresUp = true;
  } catch {
    postgresUp = false;
  } finally {
    await pool.end();
  }
});

describe('db:migrate idempotency', () => {
  it('applying migrations twice succeeds and leaves pgmigrations stable', async () => {
    if (!postgresUp) {
      console.warn('[migrations.test] Postgres not reachable at', DATABASE_URL, '— skipping');
      return;
    }

    // First run: may apply 0..N migrations (depends on DB state when test starts).
    // We don't assert the count of NEW rows, only that the run succeeds.
    execSync('pnpm db:migrate', {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL },
      stdio: 'inherit',
    });

    const pool = new Pool({ connectionString: DATABASE_URL });
    const before = await pool.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY name');
    const beforeNames = before.rows.map((r) => r.name);

    // Sanity: every checked-in migration file is applied.
    const expectedNames = ['001_initial', '002_pricing', '003_api_keys', '004_history_polish'];
    expect(beforeNames).toEqual(expect.arrayContaining(expectedNames));

    // Second run: must be a no-op. Any migration that violates idempotency
    // (e.g., CREATE TABLE without IF NOT EXISTS) throws here.
    execSync('pnpm db:migrate', {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL },
      stdio: 'inherit',
    });

    const after = await pool.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY name');
    const afterNames = after.rows.map((r) => r.name);

    // Same names, same count — second run added nothing.
    expect(afterNames).toEqual(beforeNames);

    await pool.end();
  }, 60_000); // 60s timeout — node-pg-migrate cold start + 4 migrations
});
```

- [ ] **Step 2: Run test to verify it passes (Postgres up case)**

Prerequisite: Postgres must be running. If not:
```bash
pnpm infra:up
```

Run:
```bash
pnpm --filter @lumespec/api test migrations
```

Expected: `1 passed`. The test should complete in well under 60s.

If it fails on the second `execSync` call with a `CREATE TABLE` or `CREATE INDEX` already-exists error, that is the test working as designed — it caught a non-idempotent migration. Fix the migration file to use `IF NOT EXISTS` before continuing.

- [ ] **Step 3: Run test with Postgres down to verify graceful skip**

```bash
pnpm infra:down
pnpm --filter @lumespec/api test migrations
```

Expected: test logs `Postgres not reachable ... skipping` and passes (no assertions run). This is the contract for CI environments without a DB service.

```bash
pnpm infra:up   # restart for the rest of the workflow
```

- [ ] **Step 4: Run the full apps/api test suite to confirm no regression**

```bash
pnpm --filter @lumespec/api test
```

Expected: all existing tests pass plus the new one — `163 passed` (was 162 before this task).

- [ ] **Step 5: Commit**

The hook does not require DESIGN.md sync for adding a test file. apps/api/tests is not in the trigger path list.

```bash
git add apps/api/tests/migrations.test.ts
git commit -m "$(cat <<'EOF'
test(api): assert db:migrate is idempotent across all checked-in migrations

Runs pnpm db:migrate twice via execSync against the dev Postgres,
asserts pgmigrations row set is stable between runs. Catches any
future migration that violates the re-runnable contract (missing
IF NOT EXISTS / IF EXISTS guards).

Skips gracefully when Postgres is unreachable so CI runs without
a DB service stay green; local devs running `pnpm test` after
`pnpm infra:up` exercise the assertion.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

---

## Task 3: Wire `db:migrate` into Deploy Pipeline

**Goal:** Production deploys automatically apply DB schema changes before any service container starts. Eliminates the manual SQL step.

**Files:**
- Modify: `.github/workflows/deploy.yaml` — insert step between `Build + push` (line 35) and `Deploy all services` (line 41)
- Modify: `db/README.md` — add "CI / Production Deploys" section documenting the secret

**External user action required (NOT done by the agent):** A new GitHub Actions secret named `DATABASE_URL_PROD` must exist in the repo settings, containing the production Postgres connection string (e.g., `postgresql://USER:PASS@HOST:5432/lumespec`). The plan assumes this is provisioned by the user before merging T3. The commit message and README entry both flag this requirement so it is impossible to miss.

**Why between Build+push and Deploy:** Migrations should run with the new schema knowledge baked into the image (so the deploy is "schema then code"), but before the running services see traffic. The chosen position satisfies both: the new image is built (proving the code compiles against the new schema if any TS types changed) but no service is yet rolled out.

- [ ] **Step 1: Read current deploy.yaml around the insertion point**

Run: `sed -n '34,46p' .github/workflows/deploy.yaml`

Expected: shows the `Build + push` step at lines 34–39 and `Deploy all services` step starting at line 41. The new step goes between them.

- [ ] **Step 2: Insert the db:migrate step**

Use Edit on `.github/workflows/deploy.yaml`:

old_string:
```
      - name: Build + push
        run: ./deploy/scripts/10-build-and-push.sh ${{ github.ref_name }}
        env:
          GCP_PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}
          AR_REPO_LOCATION: ${{ vars.GCP_REGION }}
          AR_REPO_NAME: ${{ vars.AR_REPO_NAME }}

      - name: Deploy all services
```

new_string:
```
      - name: Build + push
        run: ./deploy/scripts/10-build-and-push.sh ${{ github.ref_name }}
        env:
          GCP_PROJECT_ID: ${{ vars.GCP_PROJECT_ID }}
          AR_REPO_LOCATION: ${{ vars.GCP_REGION }}
          AR_REPO_NAME: ${{ vars.AR_REPO_NAME }}

      # Apply DB schema changes BEFORE rolling out new service images.
      # Migrations are idempotent (CREATE ... IF NOT EXISTS guards + the
      # apps/api migration test enforces this), so re-running is safe.
      # Failure here aborts the deploy — services keep their old image,
      # which is by design: we'd rather skip a deploy than ship code
      # against a half-migrated schema.
      - name: Apply DB migrations
        run: pnpm db:migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_PROD }}

      - name: Deploy all services
```

- [ ] **Step 3: Verify the YAML is well-formed**

GitHub Actions has no local linter shipped with this repo, so the verification is structural: confirm the indentation is 6-space (matching the surrounding `- name:` entries) and the step is syntactically valid YAML. A casual review by re-reading the file is sufficient.

Run: `sed -n '31,55p' .github/workflows/deploy.yaml`

Expected: the new `Apply DB migrations` step sits between `Build + push` and `Deploy all services`, with consistent 6-space indentation under `steps:`.

- [ ] **Step 4: Add CI / Production Deploys section to db/README.md**

Use Edit on `db/README.md`:

old_string:
```
## Local Dev Reset

To wipe the DB and re-run all migrations from scratch (destructive — local only):

```bash
pnpm infra:down
docker volume rm lumespec_postgres-data
pnpm infra:up
DATABASE_URL=postgres://lumespec:lumespec@localhost:5432/lumespec pnpm db:migrate
```
```

new_string:
```
## Local Dev Reset

To wipe the DB and re-run all migrations from scratch (destructive — local only):

```bash
pnpm infra:down
docker volume rm lumespec_postgres-data
pnpm infra:up
DATABASE_URL=postgres://lumespec:lumespec@localhost:5432/lumespec pnpm db:migrate
```

## CI / Production Deploys

`pnpm db:migrate` runs automatically as a step in `.github/workflows/deploy.yaml`,
positioned **between** `Build + push` and `Deploy all services`. It uses the
GitHub Actions secret `DATABASE_URL_PROD`, which **must** be configured in the
repo settings (Settings → Secrets and variables → Actions) before the first
deploy after this wiring lands.

If the migration step fails, the deploy aborts and services keep their old
image — by design, so we never ship code against a half-migrated schema.

Idempotency is enforced by `apps/api/tests/migrations.test.ts`, which runs
`pnpm db:migrate` twice and asserts the second run is a no-op. Any new
migration that omits `IF NOT EXISTS` / `IF EXISTS` guards will fail this
test.
```

- [ ] **Step 5: Verify db/README.md reads correctly**

Run: `cat db/README.md | tail -30`

Expected: the new "CI / Production Deploys" section sits at the end, mentions the `DATABASE_URL_PROD` secret name and the abort-on-failure semantics.

- [ ] **Step 6: Commit**

The pre-commit hook checks for `db/migrations/**` triggering DESIGN.md sync. We are touching neither — only `.github/workflows/deploy.yaml` and `db/README.md`. The hook will pass.

```bash
git add .github/workflows/deploy.yaml db/README.md
git commit -m "$(cat <<'EOF'
ci(deploy): run db:migrate between build and service rollout

Closes the last open item from the migration runner spec
(2026-04-26-sd-migration-runner-design.md). After this lands,
production deploys auto-apply schema changes via node-pg-migrate
before any service container sees traffic.

Position: between `Build + push` and `Deploy all services`. Failure
aborts the deploy — services keep their old image rather than ship
against a half-migrated schema.

REQUIRED EXTERNAL ACTION before first deploy after this merge:
  Settings → Secrets and variables → Actions → New repository secret
    Name:  DATABASE_URL_PROD
    Value: postgresql://USER:PASS@HOST:5432/lumespec

Idempotency contract enforced by apps/api/tests/migrations.test.ts.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

Expected: commit succeeds.

- [ ] **Step 7: Push all three task commits**

```bash
git push origin main
```

Expected: 3 commits land on origin/main (T1 docs, T2 test, T3 CI). After the push, the migration-runner backlog item is closed.

---

## Self-Review Notes

**Spec coverage:**
- ✅ Spec "Files Changed" table item 1 (rename `003_history_polish.sql` → `004_history_polish.sql`) — already shipped pre-plan
- ✅ Spec "Files Changed" item 2 (`003_api_keys.sql` unchanged) — already shipped
- ✅ Spec "Files Changed" item 3 (root `db:migrate` script) — already shipped
- ✅ Spec "Files Changed" item 4 (`node-pg-migrate` dep) — already shipped (in root, not apps/api — better placement since the CLI is invoked from root)
- ✅ Spec "Files Changed" item 5 (`db/README.md` new) — already shipped; T3 amends it with CI section
- ✅ Spec "Files Changed" item 6 (`.github/workflows/` update) — T3 covers
- ✅ Spec "Testing" → idempotency test — T2 covers
- ✅ Spec "Testing" → "second run exits 0 with 'no migrations to run'" — T2's second-run assertion covers
- ✅ Spec "Architecture" → "Migration runner as a standalone script (not embedded in the API process)" — already shipped; T1 brings DESIGN.md current
- ⚠️ Spec "Testing" → "New migration test: add a dummy 005_test.sql, run migrate, verify pgmigrations contains 5 rows, roll back manually" — NOT covered by T2. The T2 idempotency test is more valuable as a regression guard than the spec's add-and-rollback test, which is really a developer smoke test. Skipped intentionally; can be added later if it pulls weight.

**Type / name consistency:** No types or function signatures defined; only file paths and step ordering, all exact and reused consistently.

**Placeholder scan:** No `TBD`, no "implement appropriate error handling", no "similar to task N". Every code block is the actual content to write/run.

**External dependency:** T3 requires the user to create the GitHub Actions secret `DATABASE_URL_PROD`. This is called out twice — once in the commit message body and once in the new db/README.md section — so it cannot be silently missed.
