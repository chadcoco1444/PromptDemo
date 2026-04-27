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
- `short_description` — lowercase snake_case describing the change
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
