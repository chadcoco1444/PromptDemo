# History Polish + Acceptance Tests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add list/grid view toggle to History Vault, add integration tests for credit store debit/refund, and add a Lighthouse a11y verification script.

**Architecture:** The toggle is a single `viewMode` state added to `HistoryGrid` — grid classes switch, HistoryCard layout is unchanged. The store tests use a real pg.Pool pointed at the dev Postgres (DATABASE_URL must be set); they insert isolated test rows and clean up with `afterAll`. The Lighthouse script is a Node.js ESM script that runs `lighthouse` CLI and exits non-zero if any route scores below 95.

**Tech Stack:** React/TypeScript (toggle), pg + vitest (store integration tests), Lighthouse CLI (a11y script).

---

### Discovered: What was already done in §2

Before implementing, note that a code audit found these §2 items already shipped in v2.2:
- ✅ First-frame thumbnail extraction (render worker `renderStill` → WebP → S3)
- ✅ Full-text search on intent (`pg_trgm` GIN index in migration 003, ILIKE in route)
- ✅ Status / duration / date-range filters (route.ts query params)
- ✅ Cursor pagination with Load More (HistoryGrid.tsx + LoadMoreButton)
- ✅ Composite index `idx_jobs_user_created ON jobs(user_id, created_at DESC)` (migration 001)
- ✅ Lineage badge (LineageBadge component in HistoryCard)

Only the **list/grid toggle button** UI is missing.

---

### Task 1: List/Grid View Toggle

**Files:**
- Modify: `apps/web/src/components/HistoryGrid.tsx`

- [ ] **Step 1: Add `viewMode` state at the top of `HistoryGrid`**

  In `HistoryGrid.tsx`, after the existing `const [cursor, setCursor] = useState...` line (line 38), add:

  ```tsx
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  ```

- [ ] **Step 2: Add the toggle button group to the content render**

  In the final `return` block (line 168), replace:
  ```tsx
  <div className="space-y-6">
    <FilterBar query={query} onChange={onFilterChange} />
  ```
  with:
  ```tsx
  <div className="space-y-6">
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <FilterBar query={query} onChange={onFilterChange} />
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={() => setViewMode('grid')}
          aria-label="Grid view"
          aria-pressed={viewMode === 'grid'}
          title="Grid view"
          className={`p-1.5 rounded text-sm transition-colors ${
            viewMode === 'grid'
              ? 'text-white bg-white/10 ring-1 ring-white/20'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          ▦
        </button>
        <button
          type="button"
          onClick={() => setViewMode('list')}
          aria-label="List view"
          aria-pressed={viewMode === 'list'}
          title="List view"
          className={`p-1.5 rounded text-sm transition-colors ${
            viewMode === 'list'
              ? 'text-white bg-white/10 ring-1 ring-white/20'
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          ☰
        </button>
      </div>
    </div>
  ```

- [ ] **Step 3: Make the grid container respect `viewMode`**

  Replace the AnimatePresence wrapper's parent div (line 170):
  ```tsx
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  ```
  with:
  ```tsx
  <div
    className={
      viewMode === 'grid'
        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
        : 'grid grid-cols-1 gap-3'
    }
  >
  ```

- [ ] **Step 4: Verify the toggle works**

  Run `pnpm demo start`, navigate to `http://localhost:3001/history`, sign in, and confirm:
  - Grid button (▦) renders 3-column layout on desktop
  - List button (☰) renders 1-column stacked layout
  - Buttons show active state (white bg) for the selected mode

- [ ] **Step 5: Commit**

  ```bash
  git add apps/web/src/components/HistoryGrid.tsx
  git commit -m "feat(history): list/grid view toggle with aria-pressed state"
  ```

---

### Task 2: Credit Store Integration Tests

**Files:**
- Create: `apps/api/tests/credits/store.test.ts`

These tests use a real pg.Pool. Run `pnpm infra:up` before running the test suite. The tests create isolated rows using a random UUID test user ID and clean up in `afterAll`.

- [ ] **Step 1: Write the failing test file**

  Create `apps/api/tests/credits/store.test.ts`:

  ```typescript
  import { describe, it, expect, beforeAll, afterAll } from 'vitest';
  import pg from 'pg';
  import { debitForJob, refundForJob } from '../../src/credits/store.js';
  import { calculateRefund } from '../../src/credits/ledger.js';

  const DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgres://promptdemo:promptdemo@localhost:5432/promptdemo';

  let pool: pg.Pool;
  let testUserId: number;
  const TEST_JOB_ID = `test-store-${Date.now()}`;
  const TEST_JOB_ID_2 = `test-store2-${Date.now()}`;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    // Insert a test user row (email unique — use timestamp to avoid collisions)
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO users (name, email, email_verified, image)
       VALUES ('Test Store User', $1, now(), null)
       RETURNING id`,
      [`test-store-${Date.now()}@example.com`],
    );
    testUserId = rows[0]!.id;
    // Seed 50s of credits
    await pool.query(
      `INSERT INTO credits (user_id, balance) VALUES ($1, 50)
       ON CONFLICT (user_id) DO UPDATE SET balance = 50`,
      [testUserId],
    );
  });

  afterAll(async () => {
    // Clean up test data — cascade deletes credit_transactions + jobs rows
    await pool.query(`DELETE FROM credit_transactions WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM credits WHERE user_id = $1`, [testUserId]);
    await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    await pool.end();
  });

  describe('debitForJob', () => {
    it('debits the correct amount and returns balanceAfter', async () => {
      const result = await debitForJob(pool, {
        userId: testUserId,
        jobId: TEST_JOB_ID,
        duration: 30,
        tier: 'free',
      });
      expect(result.ok).toBe(true);
      expect(result.balanceAfter).toBe(20); // 50 - 30
    });

    it('returns insufficient_credits when balance is too low', async () => {
      // Balance is now 20; try to debit 30 again
      const result = await debitForJob(pool, {
        userId: testUserId,
        jobId: TEST_JOB_ID_2,
        duration: 30,
        tier: 'free',
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe('insufficient_credits');
    });
  });

  describe('refundForJob', () => {
    it('adds back the refund amount and returns new balance', async () => {
      const refundSeconds = calculateRefund('render', 'RENDER_FAILED', 30);
      expect(refundSeconds).toBe(15); // 50% non-retryable render refund

      const result = await refundForJob(pool, {
        userId: testUserId,
        jobId: TEST_JOB_ID,
        refundSeconds,
      });
      expect(result.ok).toBe(true);
      expect(result.balanceAfter).toBe(35); // 20 + 15
    });

    it('is idempotent — double refund is skipped', async () => {
      const result = await refundForJob(pool, {
        userId: testUserId,
        jobId: TEST_JOB_ID,
        refundSeconds: 15,
      });
      expect(result.ok).toBe(true);
      expect(result.skipped).toBe('already_refunded');
      // Balance unchanged at 35
      const { rows } = await pool.query<{ balance: number }>(
        `SELECT balance FROM credits WHERE user_id = $1`,
        [testUserId],
      );
      expect(rows[0]!.balance).toBe(35);
    });

    it('is a no-op when refundSeconds is 0', async () => {
      const result = await refundForJob(pool, {
        userId: testUserId,
        jobId: 'nonexistent',
        refundSeconds: 0,
      });
      expect(result.ok).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run the test to verify it fails (DB connected but debitForJob may not accept tier param)**

  ```bash
  cd apps/api && DATABASE_URL=postgres://promptdemo:promptdemo@localhost:5432/promptdemo pnpm vitest run tests/credits/store.test.ts
  ```

  Expected: FAIL — identify which assertions fail and whether the `debitForJob` signature matches (check `apps/api/src/credits/store.ts` for exact param names and adjust test accordingly).

- [ ] **Step 3: Fix any signature mismatches**

  Open `apps/api/src/credits/store.ts` and verify the exact parameter object for `debitForJob`. If the signature differs from what the test uses (e.g., it uses `durationSeconds` instead of `duration`), update the test to match the real signature. Do NOT change production code to match the test.

- [ ] **Step 4: Run until green**

  ```bash
  cd apps/api && DATABASE_URL=postgres://promptdemo:promptdemo@localhost:5432/promptdemo pnpm vitest run tests/credits/store.test.ts
  ```

  Expected: All 5 tests PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add apps/api/tests/credits/store.test.ts
  git commit -m "test(credits): integration tests for debitForJob + refundForJob with real pg pool"
  ```

---

### Task 3: Lighthouse A11y Verification Script

**Files:**
- Create: `scripts/check-a11y.mjs`
- Modify: `package.json` (root) — add `"a11y": "node scripts/check-a11y.mjs"` script

- [ ] **Step 1: Install Lighthouse CLI if not present**

  ```bash
  npm list -g lighthouse 2>/dev/null || npm install -g lighthouse
  ```

- [ ] **Step 2: Write the script**

  Create `scripts/check-a11y.mjs`:

  ```javascript
  #!/usr/bin/env node
  /**
   * Lighthouse accessibility score checker.
   * Requires the dev server to be running: pnpm demo start
   *
   * Usage:
   *   node scripts/check-a11y.mjs
   *   node scripts/check-a11y.mjs --base-url http://localhost:3001
   *
   * Exits 0 if all routes score >= MIN_SCORE, exits 1 otherwise.
   */
  import { spawnSync } from 'node:child_process';
  import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
  import { resolve, dirname } from 'node:path';
  import { fileURLToPath } from 'node:url';

  const __dirname = dirname(fileURLToPath(import.meta.url));
  const MIN_SCORE = 0.95;
  const BASE_URL = process.argv.includes('--base-url')
    ? process.argv[process.argv.indexOf('--base-url') + 1]
    : 'http://localhost:3001';

  const ROUTES = ['/', '/history', '/billing'];

  let allPassed = true;
  const results = [];

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route}`;
    const outPath = resolve(__dirname, `_lh-${route.replace(/\//g, '-') || 'home'}.json`);

    console.log(`\nChecking ${url} ...`);
    const r = spawnSync(
      'lighthouse',
      [
        url,
        '--only-categories=accessibility',
        '--output=json',
        `--output-path=${outPath}`,
        '--chrome-flags=--headless --no-sandbox --disable-gpu',
        '--quiet',
      ],
      { stdio: 'inherit', shell: process.platform === 'win32' },
    );

    if (r.status !== 0 || !existsSync(outPath)) {
      console.error(`  ✗ Lighthouse failed to run on ${url}`);
      allPassed = false;
      results.push({ route, score: null, passed: false });
      continue;
    }

    const report = JSON.parse(
      (await import('node:fs/promises')).then
        ? (await (await import('node:fs/promises')).readFile(outPath, 'utf8'))
        : require('node:fs').readFileSync(outPath, 'utf8'),
    );
    unlinkSync(outPath);
    const score = report.categories?.accessibility?.score ?? null;
    const passed = score !== null && score >= MIN_SCORE;
    allPassed = allPassed && passed;
    results.push({ route, score, passed });
    console.log(`  ${passed ? '✓' : '✗'} a11y score: ${score !== null ? (score * 100).toFixed(0) : 'n/a'}% (min: ${MIN_SCORE * 100}%)`);
  }

  console.log('\n--- Summary ---');
  for (const { route, score, passed } of results) {
    const pct = score !== null ? `${(score * 100).toFixed(0)}%` : 'failed';
    console.log(`  ${passed ? '✓' : '✗'} ${route.padEnd(12)} ${pct}`);
  }

  if (!allPassed) {
    console.error('\nSome routes are below the accessibility threshold. Fix the issues above.');
    process.exit(1);
  }
  console.log('\nAll routes passed accessibility check.');
  ```

- [ ] **Step 3: Add script to root package.json**

  In `package.json`, add to the `"scripts"` block:
  ```json
  "a11y": "node scripts/check-a11y.mjs"
  ```

- [ ] **Step 4: Run the check with dev server running**

  ```bash
  # In one terminal: pnpm demo start
  # In another terminal:
  pnpm a11y
  ```

  Expected: Each route prints a score. If any score is below 95%, fix the accessibility issue (common culprits: missing `alt` text, insufficient color contrast, missing `aria-label` on icon buttons).

- [ ] **Step 5: Fix any a11y issues found**

  Common fixes:
  - Add `aria-label` to icon-only buttons (the ▦/☰ toggle buttons we just added need this — already included in Task 1)
  - Add `alt=""` to decorative images (already done for `<img>` in HistoryCard)
  - Ensure form labels are associated with inputs

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/check-a11y.mjs package.json
  git commit -m "chore: Lighthouse a11y verification script (pnpm a11y)"
  ```

---

### Task 4: Update remaining-work.md

**Files:**
- Modify: `docs/superpowers/remaining-work.md`

- [ ] **Step 1: Mark completed items in §4**

  In `docs/superpowers/remaining-work.md`, update the §4 table to reflect the current state:

  Replace the §4 table rows:
  ```markdown
  | First-frame thumbnail extraction | ❌ | ... |
  | Status / duration / date-range filters | ❌ | ... |
  | Full-text search on intent | ❌ | ... |
  | Cursor pagination (24/page) | ❌ | ... |
  | List/grid toggle (mobile→list, desktop→grid) | ❌ | ... |
  | Regenerate lineage badge ("Regenerated from job X") | ❌ | ... |
  ```
  with:
  ```markdown
  | First-frame thumbnail extraction | ✅ | Shipped v2.2 — renderStill → WebP → S3 |
  | Status / duration / date-range filters | ✅ | Shipped v2.2 — route.ts query params |
  | Full-text search on intent | ✅ | Shipped v2.2 — pg_trgm GIN index (migration 003) |
  | Cursor pagination (24/page) | ✅ | Shipped v2.2 — HistoryGrid cursor + LoadMoreButton |
  | List/grid toggle | ✅ | Shipped 2026-04-26 |
  | Lineage badge | ✅ | Shipped v2.1 — LineageBadge component |
  ```

  Also update §7 acceptance criteria:
  ```markdown
  | History 24 items < 500ms | ✅ | idx_jobs_user_created already exists in migration 001 |
  | Refund within 30s of failed render | ✅ | store.test.ts integration test added 2026-04-26 |
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add docs/superpowers/remaining-work.md
  git commit -m "docs: mark history polish + acceptance test items as complete"
  ```
