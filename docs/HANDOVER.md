# LumeSpec — Handover & Operations Runbook

> **Audience:** future-you returning after a break, OR an AI agent (Claude / Codex / etc.) picking up the project. Both groups need the same thing: orient fast, find the right deep doc, run the right verification.
>
> **What this doc IS:** a map and a runbook. Architecture, navigation, ops-level verification commands.
>
> **What this doc is NOT:** a substitute for the 80+ existing docs (per-module DESIGN.md, specs, plans). It points to them — read those for depth.
>
> **Last refresh:** 2026-04-28 after Day 2 of Brand Color sprint (5 bugs shipped, full intent-spectrum verification).

---

## 1. What This Is (one paragraph + diagram)

LumeSpec is an AI-driven demo video generator. Input a product URL + intent ("hardsell" / "tech walkthrough" / "emotional brand story"), the pipeline crawls the page, asks Claude to compose a Remotion storyboard, renders an MP4. Monorepo with pnpm workspaces.

```mermaid
flowchart LR
    User([User]) --> Web[apps/web<br/>Next.js 14]
    Web --> API[apps/api<br/>Fastify]
    API -->|crawl queue| Crawler[workers/crawler<br/>Playwright]
    API -->|storyboard queue| SB[workers/storyboard<br/>Claude Sonnet]
    API -->|render queue| Render[workers/render<br/>Remotion]
    Crawler --> S3[(S3 / MinIO)]
    SB --> S3
    Render --> S3
    Crawler -.->|circuit state| Redis[(Redis<br/>BullMQ + Circuit)]
    API --> PG[(PostgreSQL<br/>jobs / credits)]
    API <--> Redis
    Render --> User
```

**Core invariants** (also enforced by `CLAUDE.md` pre-commit hook):
- Workers (crawler / storyboard / render) NEVER touch PostgreSQL — DB writes go via `apps/api` orchestrator
- Live progress lives in Redis only, NEVER in DB — broadcast via SSE
- Browser NEVER calls `apps/api` directly — always via `apps/web` BFF proxy
- Adding a Remotion scene type touches FOUR places in order: `packages/schema` → `packages/remotion/resolveScene.tsx` → `workers/storyboard/extractiveCheck.ts` → `workers/storyboard/systemPrompt.ts` (last one was historically forgotten and caused the 2026-04-27 DeviceMockup prod incident)

---

## 2. Doc Navigation — "I want to know X, read Y"

### Project-level (read first if you're new)

| Want to know | Read |
|---|---|
| Project rules (commit conventions, module boundaries, hook behavior) | [CLAUDE.md](../CLAUDE.md) |
| Public-facing pitch + tech stack + roadmap | [README.md](../README.md) |
| **THIS document** — handover + ops runbook | docs/HANDOVER.md (you're here) |

### Per-module DESIGN docs (deep architecture per worker / app / package)

| Module | DESIGN doc | What it covers |
|---|---|---|
| Fastify API + orchestrator | [apps/api/DESIGN.md](../apps/api/DESIGN.md) | Job lifecycle, credit gate, SSE, anti-pattern about fire-and-forget mirror failures (#9) |
| Next.js web BFF | [apps/web/DESIGN.md](../apps/web/DESIGN.md) | NextAuth, BFF proxy, History Vault, internal token minting |
| Crawler worker | [workers/crawler/DESIGN.md](../workers/crawler/DESIGN.md) | 3-track fallback (Playwright / ScreenshotOne / Cheerio), circuit breaker, brand color 4-tier chain, region-pinning |
| Storyboard worker | [workers/storyboard/DESIGN.md](../workers/storyboard/DESIGN.md) | 7-layer Claude defense, extractive check (incl. assertNever exhaustiveness #7), spend guard |
| Render worker | [workers/render/DESIGN.md](../workers/render/DESIGN.md) | Remotion CLI invocation, MP4 + WebP thumbnail, S3 upload |
| Remotion scenes | [packages/remotion/DESIGN.md](../packages/remotion/DESIGN.md) | 9 scene types, MainComposition, PromoComposition, visual regression |
| Zod schema (truth source) | [packages/schema/DESIGN.md](../packages/schema/DESIGN.md) | Storyboard / CrawlResult / VideoConfig types, normalizeText |
| PostgreSQL schema | [db/DESIGN.md](../db/DESIGN.md) | Tables, migrations, credit ledger transaction pattern |

### Specs and plans (full audit trail of every architectural decision)

- `docs/superpowers/specs/YYYY-MM-DD-{topic}-design.md` — design specs approved before implementation
- `docs/superpowers/plans/YYYY-MM-DD-{topic}.md` — TDD task plans executed via subagent flow
- `docs/superpowers/followups/` — post-implementation notes
- `docs/dev-notes/` — empirical experiments (e.g., intent-spectrum eval reports)

To find the spec/plan for a specific feature, grep by topic word, e.g.:
```bash
ls docs/superpowers/specs/ | grep -i circuit
```

### Operational docs

- [db/README.md](../db/README.md) — migration runbook, idempotency rules, CI db:migrate integration
- [deploy/DEPLOYMENT.md](../deploy/DEPLOYMENT.md) — GCP setup (currently DEFERRED per user 2026-04-27, will likely switch to Railway+Supabase for prod)

---

## 3. Ops-Level Verification Runbook

This section answers: **"how do I verify the system actually works"** — both during development and in (eventual) production.

### 3.1 Am I alive? Quick health checks

**During local dev:**
```bash
pnpm lume status
```
Expected: Postgres UP + 5 services UP (crawler, storyboard, render, api, web) + service health checks pass.

**API healthz endpoint** (works locally + in prod):
```bash
curl -sf http://localhost:3000/healthz | jq
```
Expected response shape (since 2026-04-27 PG-Backfill ship):
```json
{
  "ok": true,
  "pgBackfill": {
    "waiting": 0,
    "delayed": 0,
    "failed": 0
  }
}
```

**`pgBackfill.failed > 0`** = a Redis→Postgres mirror reconciliation has exhausted retries. Investigate via the dlq log line:
```bash
grep "CRITICAL.*pg-backfill DLQ" .tmp/demo/logs/api.log
```

**`pgBackfill.delayed > 0`** = transient PG mirror failures, retries scheduled. Self-heals.

### 3.2 Per-job traceability (correlate logs by jobId)

Every worker log line includes the `jobId` for the job being processed. To trace one job end-to-end:
```bash
JOB_ID=zh87AWQRTc0PW1RveNiuW
grep -E "$JOB_ID" .tmp/demo/logs/{api,crawler,storyboard,render}.log
```

The crawler also emits a per-tier brand color decision per job:
```
[crawler] brand color tier=dom-sampling value=#171717 jobId=zh87AWQRTc0PW1RveNiuW
```

→ See section 3.3.

### 3.3 Per-tier observability (brand color tier chain)

Since 2026-04-28 (Bug #1 / #1.5 ship), every crawler emits one log line per job documenting which tier produced the brand color:

```bash
grep "brand color tier" .tmp/demo/logs/crawler.log | tail -20
```

Possible `tier=` values:
- `dom-sampling` — Tier 0 (DOM background-color of buttons/headers/CTAs, with soft-neutral preference)
- `meta-theme-color` — Tier 1 (HTML `<meta name="theme-color">`)
- `logo-pixel-analysis` — Tier 2 primary (Sharp `.stats().dominant` on logo when no upstream)
- `logo-pixel-override` — Tier 2 escalation (Bug #1.5 — when upstream returned neutral and logo provides a non-neutral)
- `default-fallback` — Tier 3 (`#1a1a1a`, all upstream tiers failed)

**Distribution analysis** (helps triage future "video doesn't look like our brand" reports):
```bash
grep "brand color tier" .tmp/demo/logs/crawler.log | awk '{for(i=1;i<=NF;i++) if($i ~ /^tier=/) print $i}' | sort | uniq -c
```

If `default-fallback` ratio creeps above ~20%, that's the empirical trigger to brainstorm VLM Tier 4 (per `project_brand_color_vlm_tier4_backlog.md` memory).

### 3.4 BullMQ queue inspection

5 queues exist (`crawl`, `storyboard`, `render`, `retention`, `pg-backfill`). To inspect any of them:

```bash
# Queue depths via Redis CLI
docker exec lumespec-redis-1 redis-cli LLEN bull:crawl:wait
docker exec lumespec-redis-1 redis-cli LLEN bull:storyboard:wait
docker exec lumespec-redis-1 redis-cli LLEN bull:render:wait
docker exec lumespec-redis-1 redis-cli LLEN bull:pg-backfill:wait
```

For `pg-backfill` specifically, the `/healthz` endpoint exposes counts (see section 3.1).

### 3.5 Circuit breaker state (Redis)

Per-domain circuit breaker (in workers/crawler):
```bash
# List all currently-tracked domains
docker exec lumespec-redis-1 redis-cli --scan --pattern "circuit:*"
```

Possible keys per `<domain>`:
- `circuit:<domain>:strikes` — failure counter (3 strikes within 10 min trips circuit)
- `circuit:<domain>:open` — domain in 30-min cooldown
- `circuit:<domain>:probe` — another worker is currently probing recovery (2-min lock)
- `circuit:<domain>:healthy` — fresh-success marker (1-min TTL)

**Manually clear a stuck circuit** (e.g., after a transient WAF blip):
```bash
docker exec lumespec-redis-1 redis-cli DEL circuit:gopro.com:open circuit:gopro.com:strikes circuit:gopro.com:probe
```

**Manually open a circuit** (e.g., to test the Bug #3 Sub C fallback path):
```bash
docker exec lumespec-redis-1 redis-cli SET circuit:vercel.com:open 1 EX 600
# Submit a vercel job, observe crawler log shows it falls through to cheerio
# Cleanup:
docker exec lumespec-redis-1 redis-cli DEL circuit:vercel.com:open
```

Since Bug #3 Sub C (commit `bee9c81`), `evaluateCircuit()` is called inside the `runPlaywright` lambda (NOT at worker handler top). Open circuit → returns `{ kind: 'blocked', reason: 'CIRCUIT_OPEN' }` → `pickTrack` falls through to ScreenshotOne (if `CRAWLER_RESCUE_ENABLED=true`) → cheerio. **Job no longer dies on circuit open.**

### 3.6 Storyboard quality regression (intent-spectrum-eval)

The semantic-quality regression tool. Runs N URLs × M intents, captures storyboard.json the moment it lands in S3 (skips render to be cheap), writes a markdown matrix report.

**Default behavior** (3 URLs × 3 intents = 9 jobs, ~3-5 min wall time, ~$1.50 Anthropic spend):
```bash
DOGFOOD_USER_ID=28 node scripts/intent-spectrum-eval.mjs
```

**Filtered subset** (e.g., verify Bug #4 fix on hardsell intent only):
```bash
DOGFOOD_USER_ID=28 INCLUDE_CELLS=vercel:hardsell,burton:hardsell node scripts/intent-spectrum-eval.mjs
```

**URL menu** (in `scripts/intent-spectrum-eval.mjs:ALL_URLS`):
- `vercel` — infra SaaS, minimalist black/white brand
- `duolingo` — consumer learning app
- `gopro` — extreme sports, **Cloudflare-blocked** (still in CIRCUIT_OPEN territory; needs Bug #3 Sub A/B for SaaS fallback)
- `patagonia` — outdoor brand, **IP-routed gateway** (returns 6-line splash page; needs L4 datacenter US proxy)
- `burton` — snowboard brand, fully-functional Bug #2 verification target

Reports go to `docs/dev-notes/intent-spectrum-{date}{-supplement-N}.md`.

**Cost discipline** (`project_anthropic_credit_budget_signal.md`): each storyboard call ~$0.10-0.18. A 9-cell run is ~$1.50. Don't add to PR-level CI; weekly cadence or post-architectural-ship is fine.

### 3.7 Database state checks

Quick credit balance + tier check for a user:
```bash
node -e "
import('./apps/api/node_modules/pg/lib/index.js').then(async ({ default: pg }) => {
  const pool = new pg.Pool({ connectionString: 'postgresql://lumespec:lumespec@localhost:5432/lumespec' });
  const r = await pool.query(\`
    SELECT u.id, u.email, c.balance, s.tier
    FROM users u
    LEFT JOIN credits c ON c.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ORDER BY u.id
  \`);
  console.table(r.rows);
  await pool.end();
});
"
```

Recent failed jobs + error codes:
```bash
node -e "
import('./apps/api/node_modules/pg/lib/index.js').then(async ({ default: pg }) => {
  const pool = new pg.Pool({ connectionString: 'postgresql://lumespec:lumespec@localhost:5432/lumespec' });
  const r = await pool.query(\`
    SELECT id, status, stage, input->>'url' AS url, error->>'code' AS err
    FROM jobs WHERE status='failed' AND created_at > NOW() - INTERVAL '1 day'
    ORDER BY created_at DESC LIMIT 10
  \`);
  console.table(r.rows);
  await pool.end();
});
"
```

Migration state:
```bash
docker exec lumespec-postgres-1 psql -U lumespec -d lumespec -c "SELECT name, run_on FROM pgmigrations ORDER BY name;"
```

### 3.8 Test verification

```bash
pnpm test          # all 814 tests across 8 packages
pnpm typecheck     # workspace-level typecheck (REQUIRED — per-package alone misses cross-cutting Scene additions)
```

**Lesson learned 2026-04-27**: workspace-level typecheck is mandatory after any change to a discriminated union (e.g., Scene types). Per-package typecheck missed the DeviceMockup-not-in-extractiveCheck case → prod incident. CLAUDE.md Step 5 in the "新增 Remotion 場景的正確順序" section enforces this.

### 3.9 Post-deploy verification (when GCP/Railway is wired)

When prod deploy is wired (currently NOT — see `project_gcp_deploy_deferred.md` memory), verify:
1. `curl -sf https://<api-public-url>/healthz` returns ok
2. Submit a test job, watch worker logs for `tier=` line + storyboard generation success
3. Check `pg-backfill` queue depth — should be 0

For Railway/Supabase migration (the user's stated preference), see future spec when prioritized.

---

## 4. Current State Snapshot — 2026-04-28

### Recently shipped (last 3 days, in chronological order)

| Date | Feature / fix | Commits |
|---|---|---|
| 2026-04-26 | State machine correctness (R1) | various |
| 2026-04-26 | Spec 3 architecture boundary (R2 + R6 + R7) | various |
| 2026-04-27 | DeviceMockup hero opener scene (9th scene type) | 8bc82ed → 1a56bee |
| 2026-04-27 | PG Backfill eventual consistency (#2 phantom job blocker) | ca871ff → c3d37e3 |
| 2026-04-27 | Migration runner CI gate (#3 release blocker) | a7e7e84 → 31be45b |
| 2026-04-27 | DeviceMockup P0 hot-fix (collectSceneTexts missing case) | 1a185ba |
| 2026-04-27 | Visual regression smoke for PromoComposition | 73f6998 |
| 2026-04-27 | smart-quote folding in normalizeText (Bug #4 of intent-spectrum-eval) | 39ca103 |
| 2026-04-28 | Brand color 4-tier chain (Bug #1 + Bug #1.5 follow-up) | 7a215f9 → 9cfcdc5 |
| 2026-04-28 | US-pinned BrowserContext (Bug #2) | 07d65a0 |
| 2026-04-28 | Extractive check substring fast-path (hardsell flake fix) | c8a183b |
| 2026-04-28 | Circuit gate moved into runPlaywright lambda (Bug #3 Sub C) | bee9c81 |

Test count grew from ~700 → 814.

### Backlog — what's actually open

| Item | Status | Blocker |
|---|---|---|
| Bug #3 Sub A/B (anti-bot vendor) | OPEN | USER $ budget decision (ScreenshotOne SaaS / datacenter proxy / residential proxy) |
| L4 datacenter US proxy (for Patagonia-class IP-routed sites) | OPEN | Same vendor / budget bucket as Sub A/B |
| VLM Tier 4 (brand color VLM-on-screenshot escalation) | OPEN | Empirical trigger: prod log >20% `tier=default-fallback` rate. Not measurable until real traffic. |
| Cross-service correlation log (workers on pino + jobId child logger) | DEFERRED 2026-04-27 | Self-deferred as YAGNI. Existing `[worker] ... jobId=X` console pattern adequate for now. |
| NextAuth 5.0.0-beta.31 → stable | BLOCKED | Upstream — beta.31 is currently latest npm release; no stable yet. |
| GCP deploy infra | DEFERRED 2026-04-27 | User decided current GCP deploy.yaml setup is over-engineered for pre-prod. Future: Railway + Supabase. |

### Known unsolved cases (NOT blockers — empirical findings)

- **GoPro and similar Cloudflare-protected brands** → permanent CIRCUIT_OPEN. Bug #3 Sub C unblocked the architecture; needs Sub A/B vendor wiring to be useful.
- **Patagonia and similar IP-routed ecommerce** → CDN edge IP geo-routing bypasses our L1+L2 fix. Needs L4 proxy.
- **Duolingo "true brand color" extraction** → wordmark IS black, green only in mascot/CTAs. All 3 traditional source layers (DOM/meta/logo) legitimately return neutral. VLM Tier 4 territory.

### Memory system (for AI agents)

The agent's persistent memory lives at `C:\Users\88698\.claude\projects\c--Users-88698-Desktop-Workspace-LumeSpec\memory\`. Index in `MEMORY.md`. Key files relevant to current state:

- `project_intent_spectrum_eval_2026_04_27.md` — original 4-bug discovery report + Day 2 closure
- `project_brand_color_vlm_tier4_backlog.md` — VLM trigger criteria
- `project_l4_datacenter_proxy_backlog.md` — combined Bug #2-hard + Bug #3 vendor decisions
- `project_anthropic_credit_budget_signal.md` — operational cost notes
- `feedback_workspace_typecheck.md` — the lesson from the DeviceMockup incident
- `feedback_strict_commit_message_compliance.md` — when plan provides exact HEREDOC, dispatcher must enforce strict compliance
- `feedback_checklist_reflex_pushback.md` — surface contradictions when user issues actions contradicting their own recent decisions

### Common gotchas (encountered + documented)

1. **Anthropic credit balance** can deplete unexpectedly during heavy verification work. Hit 2026-04-28 mid-eval. Top up before sustained eval cadence.
2. **Worker code changes need full `pnpm lume stop && pnpm lume start`** — workers cache compiled JS; restart picks up changes.
3. **Workspace `pnpm typecheck` is mandatory** for cross-cutting changes (Scene unions, discriminated unions consumed by multiple packages).
4. **DESIGN.md sync hook** triggers on touching specific paths — see `scripts/check-design-sync.mjs`. Bypass with `--no-verify` only for genuinely-internal-only changes; document the bypass reason in commit body.
5. **dev `DOGFOOD_USER_ID` defaults to 1** but DB only has user 28 (chadcoco1444@gmail.com). Override env when running scripts.
6. **`pickTrack` is a fallback chain, NOT a merge.** Don't put cross-cutting logic (e.g., theme-color extraction) inside individual track files — put it in orchestrator. Anti-pattern #6 in `workers/crawler/DESIGN.md` documents the dead-code hazard.
7. **Per-domain serial submission** is required for the intent-spectrum-eval script — multiple jobs to the same domain in parallel will trip the circuit breaker before any can complete.

---

## 5. Next Sensible Sprint (when ready)

When user returns and wants to plan the next sprint, the natural priorities (in order of ROI):

1. **Bug #3 Sub A/B vendor decision** — bring concrete cost projections + sample success rates for ScreenshotOne / BrightData / etc. Architecture is ready (Sub C done); this is purely a business call. Action: brainstorm session that surfaces 2-3 vendor options with $/mo + estimated coverage rate, let user pick.

2. **First Railway + Supabase deploy attempt** — the user's stated preference for prod over the GCP path. Architecturally simpler than GCP; should require minimal new code (current `apps/api` should work as-is, just need adapter for Supabase Postgres connection). Estimate: 1-day brainstorm + 1-day implementation.

3. **A new product feature** — user explicitly said Day 1 they want to focus on user-facing features after backlog is clean. Now's the time. Likely candidates from README roadmap: Scheduled re-renders / Custom brand kit / 9:16 vertical / Team workspaces / Webhook trigger.

The "fix more bugs" instinct should be resisted for at least one sprint — current bug-discovery rate is artificially high because we just ran a deep eval. Real prod traffic + user feedback will surface different bugs worth prioritizing over speculative ones.

---

## How to use this document going forward

- **Refresh when major architectural changes ship** — add a row to section 4's "Recently shipped" table; update section 4 backlog if items move.
- **Don't bloat** — if a section grows beyond ~50 lines, extract to a dedicated doc and link from here.
- **The 80+ deep docs are the source of truth** — this doc is the index. When in doubt, point to the deep doc rather than copying its content.
