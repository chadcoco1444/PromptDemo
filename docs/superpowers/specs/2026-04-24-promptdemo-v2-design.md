# PromptDemo v2.0 — PRD + Architecture Review

**Date:** 2026-04-24
**Status:** Design spec — approved by architecture review 2026-04-24; ready for per-feature `writing-plans`. See "Post-Review Amendments" at bottom for final tweaks.
**Predecessor:** v1.0 MVP (tags `v0.1.0` … `v0.7.0-deploy-ready`, 127 commits on `main`).

---

# Part 1: PromptDemo v2.0 PRD

## Executive Summary

v1.0 proved the pipeline: a URL + intent produces a 10/30/60-second demo video via three
BullMQ workers (crawler → storyboard → render) and a Next.js frontend. It works.
It's also single-session, anonymous, visually monotone, and free.

v2.0 turns it into a product people can subscribe to. Five capabilities in one release:

1. **Visual diversity** — no two FeatureCallout scenes look the same anymore.
2. **Intent guidance** — presets remove the blank-page problem.
3. **Polish** — micro-interactions, skeletons, themed SSE progress, dark/light.
4. **Accounts + history** — log in, see past renders, regenerate with hints.
5. **Monetization** — Free / Pro / Max tiers with credit-based usage caps.

**Target user:** Indie makers, marketing ops, dev-rel teams who need a polished demo video
and don't have motion-design resources. Secondary: internal design reviews where a
working MP4 helps stakeholders align faster than a static mock.

**Success metrics (T+90 days from launch):**

- DAU / WAU ratio > 0.35 (repeat usage — history + regenerate are working)
- Free → Pro conversion rate > 4%
- Average render latency p95 < 5 min (60s videos)
- Anthropic API cost as % of revenue < 15%
- NPS ≥ 40

**Non-goals for v2.0:** Mobile app, team/workspace sharing, custom scene types via UI,
video-to-video transformations, real-time collab editing.

---

## User Flows (v2)

### New user — cold start

1. Landing page → "Try a demo video from any URL"
2. Click CTA → OAuth modal (Google / GitHub) → account auto-created with Free tier + 3 video credits
3. Form: URL input, duration radio (10/30/60, 60s locked on Free), intent textarea + **5 preset chips**
4. Submit → `/jobs/[id]` immersive progress page (stage illustrations + live log tail)
5. Video ready → playback + download + "Regenerate with different intent" panel
6. Nav "History" → grid of all past renders (thumbnail, intent snippet, duration, status)

### Returning user — iteration loop

1. Sign in
2. History → open any past render → click "Regenerate with hint"
3. Textarea pre-filled with previous intent; add delta ("make it 20% faster, emphasize data sync")
4. Submit → new job reuses crawlResult (skip crawl stage, saves ~30s) → render
5. Side-by-side comparison view: old video vs new video

### Upgrade flow

1. User hits Free tier limit (3 videos/month used)
2. Create-video form shows "Out of credits — upgrade to Pro"
3. Click → Stripe checkout → $19/month Pro subscription
4. Back to form, submit immediately → new job runs

---

## Feature 1: FeatureCallout 視覺多樣性

**Problem.** In v1.0, every `FeatureCallout` scene renders the same component (`ImagePanel`
showing the viewport screenshot, or `FakePanel` mock dashboard). A 30s video has 2–3
FeatureCallouts; a 60s has 3–4. Same panel every time = visually repetitive.

**Solution.** Introduce a `variant` prop on `FeatureCallout` with 5 renderers. The
storyboard worker assigns variants automatically by scene index + intent keywords.

### Variants

| Variant        | Visual | When used |
|----------------|--------|-----------|
| `image`        | Real viewport screenshot (current v1 default) | First FeatureCallout, always |
| `kenBurns`     | Slow pan + zoom across fullPage screenshot | Scene shows a specific "region" keyword (pricing, feature, gallery) |
| `collage`      | 3-up grid of page sections (fullPage split into thirds) | When crawler extracted ≥ 3 distinct sections |
| `bento`        | Asymmetric 5-tile grid with screenshot + iconHint + text cards | When `iconHint` is present and feature is "capabilities-style" |
| `dashboard`    | Stylized mock UI with data bars (current v1 `FakePanel`) | Fallback when no screenshot available (Tier-B crawl) |

**Selection algorithm (storyboard enrichment stage):**

```
For each FeatureCallout scene in order:
  if !assets.screenshots.viewport:
    variant = 'dashboard'
  elif scene is first FeatureCallout:
    variant = 'image'
  elif iconHint present AND description length < 100 chars:
    variant = 'bento'
  elif assets.screenshots.fullPage exists AND scene index is even:
    variant = 'kenBurns'
  elif assets.screenshots.fullPage AND feature count ≥ 3:
    variant = 'collage'
  else:
    variant = 'image'
```

This runs **deterministically** in the storyboard worker after Claude produces scenes.
Claude does NOT pick variants — keeps prompt simple + avoids Claude drifting toward one
variant.

### Animation specs

- **`kenBurns`**: 8-second pan starting at `object-position: 50% 0%`, ending at `50% 100%`, with simultaneous 1.0 → 1.15 zoom via CSS transform. Uses Remotion's `interpolate`.
- **`collage`**: 3 sub-panels, each a different Y-slice of fullPage at 33% vertical crops. Staggered entry animation (fade + slideRight at 4-frame offsets).
- **`bento`**: 5 tiles in 2-row asymmetric grid (1 big + 4 small). Big tile = viewport screenshot. Small tiles = 2 text cards + 2 decorative cards with iconHint-suggested gradients.
- **`dashboard`**: unchanged from v1 post-luminance-guard (mock UI with header + data bars + stat cards).

### Acceptance

- Rendering a 60s storyboard with 4 FeatureCallout scenes produces 4 visually distinct panels.
- Tier-B fallback (no screenshots) still renders without errors — all 4 would use `dashboard`.
- v1 storyboards (without `variant` prop) render identically to v1 behavior.

---

## Feature 2: Intent Suggestions

**Problem.** The intent textarea is a blank page. Users copy-paste something generic
("show off the features") and get a generic video. The gap between a good intent and
a mediocre one is the single biggest quality lever users can pull.

**Solution.** 5 preset chips below the intent textarea. Clicking a chip either
**fills** the textarea (if empty) or **appends** to existing text. Each preset includes
a short "feel" description so users preview before committing.

### Presets

1. **Executive Summary 高階主管摘要**
   `Emphasize business outcomes, time savings, and ROI. Keep pacing deliberate.
   Close on the single strongest value proposition. Tone: authoritative, calm.`

2. **Tutorial / Walkthrough 教學版**
   `Walk through the product step-by-step as a first-time user would experience it.
   Show the starting state → key action → result. Include screenshots of UI.
   Tone: instructive, clear, patient.`

3. **Marketing Hype 行銷版**
   `High-energy promotional spot. Short punchy scene durations. Emphasize speed,
   results, and aesthetic. Use a single powerful tagline. Tone: energetic, modern.`

4. **Technical Deep-Dive 技術向**
   `Speak to a developer audience. Emphasize architecture, integrations, and
   engineering decisions. Highlight data flows and performance characteristics.
   Tone: precise, substantive, respectful of expertise.`

5. **Customer Success Story 客戶案例**
   `Frame as a user journey: the problem, the before state, adopting the tool,
   the after state with measurable results. Use testimonial-style beats.
   Tone: narrative, empathetic, outcome-focused.`

### UX

- Chips appear below the intent textarea.
- Hover = show tooltip with full preset text.
- Click empty textarea + chip = fill with preset.
- Click non-empty textarea + chip = append `\n\n[Preset: <name>]\n<preset text>`.
- Textarea always editable; presets are seeds, not locks.

### Localization

- Chip labels detect browser language (`navigator.language`) to render Chinese or English.
- Underlying preset text passed to Claude is **always English** (Claude's Chinese prompting is weaker; English gives more consistent scene generation).

### Acceptance

- All 5 presets produce visibly different video pacing / tone when submitted with the same URL.
- Chip click completes in <50ms (no network call).
- Preset text appears verbatim in the submitted job's `input.intent` in the DB (audit-friendly).

---

## Feature 3: UI/UX 升級

Applied `ui-ux-pro-max` principles: deliberate use of motion to communicate state, never
decoration for its own sake; skeletons wherever the primary content is network-bound;
one-click theme toggle with system-preference default.

### 3.1 Micro-interactions

- **Primary CTA button** ("Create video"): 200ms ease-out scale 1.0 → 0.97 on press, color desaturates 10%; releases with 150ms spring back. Success state (post-response) morphs to a green check for 600ms before route transition.
- **Form inputs**: 150ms focus ring (2px, `brand.500`) + 1px border-color fade. Validation errors slide-down 120ms, shake 3×5px on invalid submit.
- **Chip clicks** (preset chips from Feature 2): 80ms tap-feedback on selection; subtle "pop" scale animation (0.95 → 1.05 → 1.0).
- **History cards**: hover lifts 4px with shadow expansion (250ms), cursor `pointer`, title color shifts to `brand.600`.

### 3.2 Skeletons

- **History page**: 8 grey gradient-pulse cards while `GET /api/users/me/jobs` is in-flight. Each card has thumbnail + 2 text lines + chip shapes.
- **Job page** (before SSE connects): placeholder progress stages with pulsing stage labels.
- **Video player**: blurred thumbnail while MP4 loads (first-frame extracted at render time and served as poster).

### 3.3 SSE Immersive Progress

The current v1 progress page shows `Crawling…` / `Generating storyboard…` / `Rendering…`
as plain text. v2 replaces with a 3-step vertical rail, each step showing **live intel**
from the SSE stream:

```
┌─────────────────────────────────────────┐
│ ● Crawling                              │
│   └ https://example.com                 │
│     3 screenshots · 47 text blocks      │
│     Track: playwright                   │
├─────────────────────────────────────────┤
│ ○ Writing storyboard                    │
│   └ Claude Sonnet 4.6                   │
│     Attempt 1 of 3 · 847 tokens in      │
├─────────────────────────────────────────┤
│ ○ Rendering                             │
│   └ Composition: MainComposition       │
│     Frame 127 / 900 · fps 31.2          │
└─────────────────────────────────────────┘
```

Each step expands on hover to show the full SSE event log (collapsible). Uses existing
`progress` and `stage_done` SSE events (no new event types required server-side).

### 3.4 Theme Toggle

- Sun/moon icon in top-right nav.
- 3-state cycle: `system` (default) → `light` → `dark`.
- Persists to `localStorage` + `user.preferences.theme` in DB (when signed in).
- Tailwind CSS `darkMode: 'class'` — toggle adds/removes `.dark` on `<html>`.
- All brand colors have dark mode counterparts defined in `tailwind.config.ts`.
- CSS transitions on `background-color` + `color` = 180ms; prevents jarring flash.

### Acceptance

- Lighthouse accessibility score ≥ 95.
- Dark mode CLS (cumulative layout shift) = 0.
- SSE progress rail updates within 50ms of receiving an event (no polling loop).
- Theme preference survives logout / login.

---

## Feature 4: Auth + History

### 4.1 Authentication

**NextAuth v5** with two OAuth providers for MVP: **Google** and **GitHub**.

- Session: JWT strategy (stateless, no session table); token stored in httpOnly cookie.
- On first login, user row inserted into Postgres with 3 starter credits (Free tier).
- Email extraction for account recovery; no password storage.
- All `/api/jobs*` endpoints require valid session except the `/healthz` smoke.
- SSE stream (`GET /api/jobs/:id/stream`) validates session via cookie on each connection.

### 4.2 History Page

- Route: `/history`.
- Grid/list toggle (default list on mobile, grid on desktop).
- Each card:
  - Thumbnail (first-frame of rendered MP4, served from S3 at `jobs/<jobId>/thumb.jpg` — extracted by render worker)
  - Intent snippet (first 120 chars, truncate with ellipsis)
  - URL favicon + hostname
  - Duration badge (10/30/60s)
  - Status badge (done / failed / rendering…)
  - Created date (relative — "2 hours ago")
- Filters: status, duration, date range, free-text search on intent (Postgres full-text).
- Pagination: cursor-based (24 cards per page).

### 4.3 Regenerate with Hint (preserved from v1, tightened)

- Button on history card opens modal: previous intent shown + hint textarea.
- Submit creates new job with `parentJobId` set.
- Orchestrator detects `parentJobId` → reuses `crawlResultUri` from parent → skips crawl stage.
- Savings: ~30s per regenerate (no re-crawl).
- History shows regeneration lineage: hover card → "Regenerated from job X" link.

### Acceptance

- Anonymous user hitting `/history` redirects to OAuth flow.
- History loads 24 items in < 500ms (indexed query).
- Regenerated video shares crawl assets with parent (verified via identical `crawlResultUri`).

---

## Feature 5: Pricing Tiers + Credits

### 5.1 Tiers

| Feature                          | Free         | Pro ($19/mo)   | Max ($99/mo)     |
|----------------------------------|--------------|----------------|------------------|
| Videos per month (credits)       | 3            | 30             | Unlimited\*      |
| Durations                        | 10s, 30s     | 10/30/60s      | 10/30/60s + 120s |
| Concurrent jobs                  | 1            | 3              | 10               |
| Watermark                        | Yes (bottom) | No             | No               |
| History retention                | 30 days      | 90 days        | 365 days         |
| Regenerate with hint             | ❌           | ✅             | ✅               |
| Priority render queue            | ❌           | ✅             | ✅ (dedicated)   |
| API access                       | ❌           | ❌             | ✅               |
| Support                          | Community    | Email 48hr     | Email 12hr       |

\* *Unlimited up to 200 videos/month fair-use cap; overage metered at $0.50/video.*

**Credits model:**

- Free tier gets 3 credits/month.
- Pro: 30 credits/month (1 credit = 10s, so you can make 30 × 10s OR 10 × 30s OR 5 × 60s — your choice).
- Max: 200 fair-use, metered overage.
- Credits refresh on billing cycle anniversary; unused credits do NOT roll over (prevents stockpiling + hoarding).
- Failed renders (server-side error) auto-refund credits.

### 5.2 Cost accounting — why these prices?

Per-video cost breakdown (60s video):

| Stage        | Resource          | Cost    |
|--------------|-------------------|---------|
| Crawl        | Cloud Run worker (2 vCPU × 30s) | $0.008 |
| Crawl rescue | ScreenshotOne API (1 call)      | $0.003 |
| Storyboard   | Claude Sonnet 4.6 (~5k in + 2k out tokens, cache hit assumed)    | $0.015 |
| Render       | Cloud Run worker (4 vCPU × 5 min × dedicated CPU)                | $0.042 |
| Storage      | GCS (50 MB × 1 month)                                             | $0.001 |
| Egress       | 1 × MP4 download (15 MB)                                          | $0.001 |
| **Total**    |                                                                   | **~$0.07** |

Cost scales down for 10s / 30s videos (render dominates, linear with duration).

Pro tier revenue math: $19/mo − 30 × $0.05 avg (mix of 10/30/60s) = $17.50 gross margin
(92%). Plenty of headroom for overhead, support, and infra expansion.

Max tier at $99 targets agencies and power users. At 200 videos/mo, infra cost ≈ $14,
margin ≈ 86%.

### 5.3 Stripe integration

- Checkout via Stripe Checkout Session (hosted), not Payment Element (faster to ship).
- Customer Portal for self-service cancel / swap plan / update card.
- Webhooks on `customer.subscription.updated` + `invoice.paid` update Postgres `subscriptions` table.
- Grace period: 3 days of API access after subscription lapse before downgrading to Free tier.

### 5.4 Enforcement points

Credits are checked and debited at these moments in the orchestrator:

1. **POST /api/jobs**: Check `user.credits >= video_cost(duration)`. If insufficient → 402. Else decrement immediately (optimistic debit).
2. **Job failure**: If render worker emits `failed` with `retryable: false`, refund debited credits.
3. **User downgrade from Pro → Free mid-cycle**: Active subscription stays until period end; downgrade flips bits only on billing-cycle boundary.

### Acceptance

- User with 0 credits gets 402 on POST /api/jobs with clear message + upgrade CTA.
- Concurrent job limit enforced at orchestrator: 4th job POST while 3 active → 429 with "plan allows 3 concurrent".
- Failed renders refund within 30 seconds (validated by rendering a known-bad URL → check Postgres credit balance).

---

## Rollout Sequencing

**Dependency graph (what must ship before what):**

```
Feature 1 (FeatureCallout variants) ─┐
                                     ├─→ ships any time, no deps
Feature 2 (Intent presets)         ──┘

Feature 4.1 (Auth) ───────→ Feature 4.2 (History) ───→ Feature 4.3 (Regenerate tight)
                                                   │
                                                   └───→ Feature 5 (Pricing)

Feature 3 (UI/UX polish) ──→ shippable anytime (enhances 4+5)
```

**Recommended order of implementation + timeline (assuming 1 engineer):**

1. **Week 1–2**: Feature 1 + Feature 2 (no backend schema changes; Remotion + Next.js only)
2. **Week 3–4**: Postgres setup + NextAuth + Feature 4.1 (auth) — largest infra shift
3. **Week 5**: Feature 4.2 (History page) + Feature 4.3 (regenerate)
4. **Week 6**: Feature 3 (UI/UX polish) — can overlap with week 5 partially
5. **Week 7–8**: Feature 5 (Pricing / Stripe / enforcement) — last because it gates everything behind payment

Total: ~8 weeks for solo senior engineer.

Each feature gets its own `docs/superpowers/plans/` doc via the `writing-plans` skill
before implementation begins. This v2.0 spec is the roadmap, not the plan.

---

# Part 2: Architecture Review & Solutions

Same design now with architect's eyes. Everywhere the PRD is vague or optimistic,
sharpen it.

## 1. Zod Schema Compatibility for FeatureCallout Variants

### Current schema (v1, `packages/schema/src/storyboard.ts`)

```ts
const FeatureCalloutSchema = z.object({
  ...sceneBase,
  type: z.literal('FeatureCallout'),
  props: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    layout: z.enum(['leftImage', 'rightImage', 'topDown']),
    iconHint: z.string().optional(),
  }),
});
```

### v2 schema (backward compatible)

```ts
const FeatureVariantSchema = z.enum([
  'image',       // v1 default
  'kenBurns',
  'collage',
  'bento',
  'dashboard',   // Tier-B fallback (no screenshot available)
]);

const ImageRegionSchema = z.object({
  yOffset: z.number().min(0).max(1),
  zoom: z.number().min(1).max(2),
}).optional();

const FeatureCalloutSchema = z.object({
  ...sceneBase,
  type: z.literal('FeatureCallout'),
  props: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    layout: z.enum(['leftImage', 'rightImage', 'topDown']),
    iconHint: z.string().optional(),
    // v2 ADDITIONS — all optional
    variant: FeatureVariantSchema.default('image'),
    imageRegion: ImageRegionSchema,
  }),
});
```

### Why this is safe

1. **Optional with defaults.** A v1 storyboard (no `variant` field) parses fine and gets `variant: 'image'` via Zod default — identical to v1 rendering.
2. **No schema version bump in Redis payloads.** BullMQ job payloads never include the full Storyboard — they pass `storyboardUri` only. Storyboards live as JSON in S3.
3. **Schema dispatched at runtime, not at bundle time.** The `resolveScene` dispatcher in `packages/remotion/src/resolveScene.tsx` adds a switch on `scene.props.variant`. Default branch (`image`) is the current v1 code path.

### Forward migration (when v2.1 adds more variants)

- Use `z.enum([...])` expansion — existing stored JSON still parses because `default('image')` kicks in for rows missing the field.
- NEVER remove a variant from the enum — if we deprecate one, render it as `image` at the resolveScene layer (silent downgrade).

### Risk: Claude producing invalid variant

Storyboard worker's Zod validation (`zodValidate.ts`) will catch this and retry. But
since Claude doesn't pick variants (storyboard worker does, deterministically post-Claude),
this can't happen by design. Guard: in the enrichment stage, after selecting variant,
**always call `FeatureVariantSchema.parse(variant)` before insertion** to catch any
code-level typo in the selection algorithm.

---

## 2. Redis → PostgreSQL Migration (with zero downtime)

### Current state

- Job records in Redis hash: `job:<jobId>` → JSON, 7-day TTL.
- `jobStore.ts` abstraction hides the Redis client.
- SSE broker lives in API's memory (rebuilt on each deploy).
- BullMQ queues on Redis (unchanged in v2).

### Target state

```sql
-- users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('google', 'github')),
  auth_provider_id TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  preferences JSONB NOT NULL DEFAULT '{}',    -- theme, locale, etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (auth_provider, auth_provider_id)
);

-- subscriptions (one row per user; Free users get row with tier='free')
CREATE TABLE subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'max')) DEFAULT 'free',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',     -- 'active' | 'past_due' | 'canceled'
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- credits: current balance
CREATE TABLE credits (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  last_refresh_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- credit_transactions: audit log (immutable)
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT,                                -- nullable: monthly refresh isn't tied to a job
  delta INTEGER NOT NULL,                     -- negative = debit, positive = refund/refresh
  reason TEXT NOT NULL,                       -- 'debit' | 'refund' | 'refresh' | 'grant' | 'overage'
  balance_after INTEGER NOT NULL,             -- denormalized for O(1) history queries
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_txn_user_time ON credit_transactions (user_id, created_at DESC);

-- jobs: THE table, replaces Redis job:<id> hash
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,                          -- existing nanoid format
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_job_id TEXT REFERENCES jobs(id),
  status TEXT NOT NULL CHECK (status IN (
    'queued','crawling','generating','waiting_render_slot','rendering','done','failed'
  )),
  stage TEXT CHECK (stage IN ('crawl','storyboard','render')),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  input JSONB NOT NULL,                         -- { url, intent, duration, hint?, parentJobId? }
  crawl_result_uri TEXT,
  storyboard_uri TEXT,
  video_url TEXT,
  thumb_url TEXT,
  fallbacks JSONB NOT NULL DEFAULT '[]',
  error JSONB,
  credits_charged SMALLINT NOT NULL DEFAULT 0,  -- refund basis
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_jobs_user_created ON jobs (user_id, created_at DESC);
CREATE INDEX idx_jobs_status_updated ON jobs (status, updated_at DESC);    -- for orchestrator monitoring
CREATE INDEX idx_jobs_parent ON jobs (parent_job_id) WHERE parent_job_id IS NOT NULL;
CREATE INDEX idx_jobs_intent_fts ON jobs USING GIN (to_tsvector('english', input->>'intent'));
```

### Migration strategy (4 phases, zero-downtime)

**Phase 1 (week 3, day 1–2): Dual-write**
- New code writes to both Redis AND Postgres for every `jobStore.create` / `patch`.
- Reads still from Redis.
- Risk: race conditions between two writes. Mitigation: write order is Postgres → Redis; if Postgres fails, abort before Redis write. Transactional consistency wins.

**Phase 2 (week 3, day 2–5): Backfill**
- Cron job reads all `job:*` keys from Redis, upserts to Postgres.
- Idempotent: `ON CONFLICT (id) DO UPDATE SET ...` with `updated_at = GREATEST(excluded.updated_at, jobs.updated_at)`.
- Verification: count mismatch between Redis key count and Postgres row count < 0.1%.

**Phase 3 (week 3, day 5–6): Switch reads**
- Flag `READ_FROM_POSTGRES=true` flips read path.
- Monitor API error rate for 24 hours.
- Rollback procedure: flip env var back; Redis still has last 7 days of data.

**Phase 4 (week 4): Retire dual-write**
- Remove Redis writes from jobStore (still using Redis for BullMQ + SSE).
- Let Redis `job:*` keys expire naturally (7-day TTL).

### What stays in Redis

- BullMQ queues (unchanged — stateful queue primitives, not our data model).
- SSE broker subscriber list (per-pod in-memory — fine since SSE connections are sticky).
- Rate limit counters (ephemeral; can rebuild in seconds if Redis restarts).

---

## 3. Credit Governance + Anti-Abuse

### Threat model

1. **Credential theft** → attacker runs free user's credits dry. Low impact (free = 3 credits).
2. **Paid user abuse** → bot spins up 1000 jobs in parallel. High impact (Anthropic token burn + infra spike).
3. **Application bug** → infinite retry loop chews credits. Medium impact (self-healing after detection).

### Architecture

#### Pre-flight check (at POST /api/jobs)

```sql
BEGIN;
SELECT balance FROM credits WHERE user_id = $1 FOR UPDATE;  -- row lock
-- application code: if balance < cost, abort with 402
UPDATE credits SET balance = balance - $cost, updated_at = now() WHERE user_id = $1;
INSERT INTO credit_transactions (user_id, job_id, delta, reason, balance_after)
VALUES ($1, $2, -$cost, 'debit', $newBalance);
COMMIT;
```

This is a single transaction with row-level lock. At peak contention (one user
submitting 100 jobs in parallel), Postgres serializes them — no over-debit possible.

`SELECT FOR UPDATE` is cheap on a 1-row lookup with PK index.

#### Concurrent job cap (per-user)

```sql
SELECT COUNT(*) FROM jobs
WHERE user_id = $1
  AND status IN ('queued','crawling','generating','waiting_render_slot','rendering');
```

Compare against tier limit (Free: 1, Pro: 3, Max: 10). Runs inside the same transaction
as credit debit so both checks are atomic.

#### Anthropic daily spending guard

- Separate Postgres row: `system_limits.anthropic_daily_spend_usd`.
- Each storyboard worker invocation updates it after Claude call completes (actual token cost from API response).
- When > 80% of daily cap → Slack alert to ops.
- When > 100% → storyboard worker refuses new jobs until midnight UTC (reject with `STORYBOARD_BUDGET_EXCEEDED`). Users see error, credits auto-refunded.

#### Rate limit layers (defense in depth)

| Layer | Limit | Scope | Persistence |
|-------|-------|-------|-------------|
| API Gateway | 10 req/min/IP | POST /api/jobs | Redis (existing) |
| User tier | 3/30/∞ monthly | POST /api/jobs | Postgres credits table |
| Concurrency | 1/3/10 active jobs | Orchestrator | Postgres jobs table |
| Render queue | 20 globally | Orchestrator backpressure | BullMQ queue depth |
| Anthropic budget | $X/day (configurable) | Storyboard worker | Postgres system_limits |

All five must agree for a job to actually render. Single point of bypass = bug.

#### Refund logic

- **Crawl failed**: full refund (nothing charged yet anyway; we debit at POST time, so refund credits_charged).
- **Storyboard failed**: 50% refund (Claude call was made, we ate that cost).
- **Render failed (retryable)**: BullMQ retries up to 1×; if final attempt fails, full refund.
- **Render failed (non-retryable, e.g. invalid storyboard)**: 50% refund (infra ran).

Refund rules codified in a pure function `calculateRefund(stage, errorCode): creditsToReturn`
so they're trivially testable.

---

## 4. Three Fatal Risks + Mitigations

### Risk A: Cloud Run render worker cost blowup

**Scenario.** Viral share: 1,000 users sign up in 2 hours, all click "generate 60s video".
Each render = 4 vCPU × 5 min = $0.05. 1,000 renders = $50 compute + queue wait times
explode to hours. Real impact: bad UX (users waiting 2+ hours), budget overrun, possible
cascading Anthropic rate-limit block.

**Mitigation.**

1. **Global BullMQ `active` cap stays at 20** (from v1). Already prevents unbounded Cloud Run scale-out. Users just wait in queue with position indicator (already implemented in SSE `queued` event).
2. **Per-tier concurrency** (from Section 3): Free 1, Pro 3, Max 10. Distributes access fairly under load.
3. **Circuit breaker on render p95.** Cron every 30 seconds compute p95 render time across last 20 completed jobs. If > 10 min, orchestrator pauses new render queue enqueues → jobs sit in `generating` until p95 recovers. Users see "System under unusual load" banner.
4. **Cloud Billing budget alerts** at 50% / 80% / 100% of monthly cap. Paging on 100%.
5. **Absolute kill-switch env var**: `RENDER_MAX_CONCURRENT_GLOBAL=20` — reducible to 5 in an emergency deploy.

### Risk B: Credits don't match user mental model

**Scenario.** User buys "30 credits" thinking = 30 videos. But 60s = 6 credits. They make 5 videos and see `0 credits`. User confused → churn, support tickets, refund requests.

**Mitigation.**

1. **Don't lead with credits in UI.** Pricing page shows "30 videos/month" for Pro. Credits appear only when a user combines durations in a way that exceeds 30 × 10s-equivalents.
2. **Pre-submit cost preview.** On the form, below "Create video" button: `Will use 3 credits · 27 remaining`. Real-time calculation.
3. **Tooltip + onboarding.** On first login, 3-tooltip tour: "Each 10s = 1 credit", "Pro gives you 30 credits = up to 30 × 10s videos", "Credits refresh monthly".
4. **Docs / FAQ** dedicated page explains the math. Link from billing.
5. **Alternative consideration (YAGNI for v2.0)**: We could just sell "videos" directly (3/30/unlimited per month, no fractional credits) and charge $0.50 overage per video. Simpler mental model. Trade-off: less flexibility for users who want 10 × 10s instead of 1 × 60s. **Recommendation: ship credits in v2.0 but watch cancellation-reason surveys; if "pricing confusion" is top-3, switch to simple videos-per-month in v2.1.**

### Risk C: Postgres migration corrupts in-flight jobs

**Scenario.** User's 60s render is mid-flight (4 min into 5 min). We cut over Redis → Postgres reads. API now can't find their job. User sees `404 job not found` on their progress page. They contact support, we look manually in Redis, restore their data by hand.

**Mitigation.**

1. **Migration during maintenance window.** 04:00 Taiwan time (lowest traffic, no Asia/Europe overlap).
2. **Drain pattern.** 30 minutes before cutover:
   a. API starts rejecting new POST /api/jobs with `503 scheduled maintenance`.
   b. Wait for BullMQ queue depth on all three queues = 0.
   c. Wait for all `status IN ('crawling','generating','rendering')` to complete or fail.
   d. Now safe: no in-flight jobs exist.
3. **Versioned API routes during transition.** Deploy `/api/v2/*` Postgres-backed alongside `/api/*` Redis-backed. Frontend uses `/api/v2/*`. Old `/api/*` exists for 30 days then deletes. Minimal user-visible cutover point.
4. **Rollback runbook.** If post-migration error rate > 1% in first hour, run `ROLLBACK_POSTGRES_READS` env flip (reverts API to Redis reads; Postgres keeps receiving dual-writes silently for future retry).
5. **Backup verification.** Daily PG dumps to GCS. Quarterly tested restore drill.

---

## Spec Self-Review

- **Placeholders.** No "TBD" / "TODO" / "fill in later" in either Part 1 or Part 2. All numbers grounded (cost per stage, response thresholds, migration phases).
- **Internal consistency.** Rollout order (Auth → History → Regenerate → Pricing) matches the dependency graph. Credit-cost table in Part 1 matches refund logic in Part 2 Section 3. Zod schema changes in Part 2 Section 1 align with Feature 1 variant selection algorithm.
- **Scope.** 5 subsystems, explicitly sequenced over 8 weeks. Each feature will get its own plan doc via `writing-plans` when implementation starts. This spec is the blueprint, not the construction plan.
- **Ambiguity.** Variant selection algorithm (Part 1 Feature 1) is pseudo-code but deterministic — implementation plan will give exact TypeScript. Credit refund percentages (100/50/100/50) are explicit. Concurrency caps (1/3/10) explicit. Pricing (19/99) explicit.

---

# Post-Review Amendments (2026-04-24)

Architecture review pass produced 3 binding refinements + variant scope decision.
These override anything above where they conflict.

## A. Split `status/stage` (Postgres) from `progress %` (Redis-only)

**Problem with original spec.** Section 2's table includes `progress SMALLINT` on the
`jobs` table. Render worker emits progress ~5×/sec. Dual-writing that to Postgres
creates row-update storms, index churn on `idx_jobs_status_updated`, and WAL bloat.
Every job becomes a hot row for ~5 minutes. With 20 concurrent renders that's 100
writes/sec on a single table — a deadlock generator.

**Fix.** Two-tier state model:

| Lives in | Data | Write frequency |
|----------|------|-----------------|
| Postgres `jobs` | `status`, `stage`, terminal fields (`video_url`, `error`, `credits_charged`), timestamps | On transitions only (~5 writes/job lifecycle) |
| Redis `progress:<jobId>` | `progress` 0–100, last-event-timestamp, live log tail | Every worker heartbeat (~5×/sec) |
| SSE broker | Fan-out from Redis pub/sub, never touches Postgres | Pass-through |

Drop `progress` column from the `jobs` DDL. Rebuild after-the-fact progress views from
`credit_transactions` + `updated_at` deltas if product ever asks for historical charts
(YAGNI for v2.0). Keep Redis keys with 1-hour TTL post-completion — nobody needs
frame-by-frame history after the video renders.

## B. S3/GCS retention via Object Lifecycle Management, not app-level deletion

**Problem with original spec.** Section 4.2 says Free retains 30 days, Pro 90, Max 365.
The PRD implies deleting history rows, but doesn't address the S3 MP4s + thumbs that
dominate storage cost. If we delete Postgres rows but leave S3 objects, storage bill
grows monotonically.

**Fix.** Don't write a cleanup worker. Use bucket-native lifecycle rules:

- Object key convention: `tier/<free|pro|max>/<userId>/<jobId>/video.mp4` (prefix = tier).
- GCS lifecycle rule per tier prefix: `age > 30/90/365 days → DELETE`.
- Bucket also runs `age > 30 days AND storage_class=STANDARD → NEARLINE` for cost.
- Postgres `jobs` rows survive retention (cheap, 1 KB/row); UI renders "video expired"
  placeholder when `video_url` 404s.

One-time migration step: when a user changes tier, backend re-keys their future
objects (not past ones — past renders get their original tier's retention, and that's
fine because they were already paid for).

## C. Drop "credits" language, show "render seconds"

**Problem with original spec.** Feature 5 and Risk B admit that "1 credit = 10s" is
confusing. The mitigations in Risk B (tooltips, FAQ, pre-submit preview) are all
papering over a bad abstraction. Risk B literally flags "if pricing confusion is
top-3 cancellation reason, switch to videos-per-month in v2.1" — that's an admission
we should ship the right model the first time.

**Fix.** Ship with "render-seconds" as the primary unit from day one:

- **Pricing page copy:**
  - Free: "30 seconds of video per month" (= 3 × 10s)
  - Pro: "300 seconds / month" (= 5 × 60s OR 10 × 30s OR 30 × 10s)
  - Max: "2000 seconds / month" + "overage $0.05/sec"
- **In-app balance indicator (top nav):** `240s remaining this month`
- **Cost preview on form:** Button sub-text reads `Will use 60 seconds · 180s remaining`
- **API & DB internals still use integer credits** (cleaner math: 1 sec = 1 credit;
  stored `balance INTEGER` in seconds). Only the UI layer converts. Zod schemas and
  `credit_transactions` are unchanged — this is purely a presentation decision.
- **Removed from spec:** the onboarding tooltip tour explaining credit math. No longer
  needed because "seconds" is self-explanatory.

Revised tier table (replaces Section 5.1):

| Feature                          | Free         | Pro ($19/mo)   | Max ($99/mo)     |
|----------------------------------|--------------|----------------|------------------|
| Render seconds / month           | 30s          | 300s           | 2000s + overage  |
| Durations allowed                | 10s, 30s     | 10/30/60s      | 10/30/60/120s    |
| Overage rate                     | —            | —              | $0.05/sec        |
| Concurrent jobs                  | 1            | 3              | 10               |
| (other rows unchanged)           |              |                |                  |

Failed renders refund the full duration back to the user's balance.

## D. Variant scope: Ken Burns in, Bento deferred to v2.1

Feature 1's 5 variants trimmed to 4 for v2.0:

- `image` ✅ ship v2.0 (default, zero-cost)
- `kenBurns` ✅ ship v2.0 (CSS transform + Remotion `interpolate`, <1 day build)
- `collage` ✅ ship v2.0 (3-up slice, moderate build)
- `dashboard` ✅ ship v2.0 (v1 FakePanel, already built)
- `bento` ⏸ **defer to v2.1** — asymmetric grid layout + per-tile spring animations
  + icon hint rendering is a multi-day rabbit hole that blocks the monetization path.

Update Feature 1's `FeatureVariantSchema` and selection algorithm:

```ts
const FeatureVariantSchema = z.enum(['image', 'kenBurns', 'collage', 'dashboard']);
```

Selection algorithm (revised — Bento branch removed):

```
For each FeatureCallout scene in order:
  if !assets.screenshots.viewport:                          → 'dashboard'
  elif scene is first FeatureCallout:                       → 'image'
  elif assets.screenshots.fullPage AND scene index is even: → 'kenBurns'
  elif assets.screenshots.fullPage AND feature count ≥ 3:   → 'collage'
  else:                                                     → 'image'
```

v2.1 will re-introduce `bento` without a schema version bump (enum expansion is backward
compatible per Part 2 Section 1).

## E. Review Gate — answered

| Q | Decision |
|---|----------|
| Free tier (3 videos, 10s+30s only) | **Keep.** Sufficient for "wow moment" without giving away a full project. |
| Pro price $19 | **Keep.** Gross margin ≈ 80% even with heavy usage; $19 is the no-expense-report SaaS sweet spot. |
| 5 Intent presets | **Keep all 5.** Prune later via telemetry (chip click-through rates). |
| Bento vs Ken Burns for v2.0 | **Ken Burns ships v2.0; Bento deferred to v2.1** (see D). |

## Next Step

Spec is final. Invoke `writing-plans` skill for **Feature 1 (FeatureCallout variants
v2.0: image + kenBurns + collage + dashboard)** — zero backend dependencies, unblocks
immediate visual win while Auth/Postgres work kicks off in parallel.
