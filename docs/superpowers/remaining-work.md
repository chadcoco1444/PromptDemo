# PromptDemo v2.0 — Remaining Work

Audit of the v2 spec ([docs/superpowers/specs/2026-04-24-promptdemo-v2-design.md](specs/2026-04-24-promptdemo-v2-design.md)) against shipped state as of `a0b0d0d` (2026-04-25). Everything below is what the spec promised that has NOT yet been built or validated.

Sections in order of likely sequencing for a production launch.

---

## 1. Stripe Integration (intentional defer until prod deploy)

**Why deferred:** every other piece of the credit economy is wired (debit/refund, tier table, concurrency caps, billing UI with placeholder buttons). Stripe is the last mile and needs real keys + a public webhook URL. We pick it up the day we wire the production deployment.

**Scope when picked up:**

### 1.1 Checkout (Stripe Checkout Session, hosted)

- `apps/web/src/app/api/billing/checkout/route.ts` — POST creates a `checkout.sessions.create` for `tier ∈ {pro, max}`, returns `{ url }` for the client to redirect.
- Wire `STRIPE_SECRET_KEY` + `STRIPE_PUBLIC_KEY` + `STRIPE_PRICE_ID_PRO` / `STRIPE_PRICE_ID_MAX` into `.env.example` and `.env`.
- Replace the disabled "Coming soon" buttons in [apps/web/src/app/billing/page.tsx](../../apps/web/src/app/billing/page.tsx) with real client handlers that POST to the checkout route and `window.location` to the returned URL.
- Set `success_url=${origin}/billing?checkout=ok&session_id={CHECKOUT_SESSION_ID}` and `cancel_url=${origin}/billing?checkout=cancel`. Show a toast on the billing page for both.

### 1.2 Webhook (`POST /api/webhooks/stripe`)

- `apps/web/src/app/api/webhooks/stripe/route.ts` — verify `stripe-signature` header with `stripe.webhooks.constructEvent`, **reject if `STRIPE_WEBHOOK_SECRET` is unset**.
- Idempotency: insert `event.id` into the existing `stripe_events` table (already migrated in [db/migrations/002_pricing.sql](../../db/migrations/002_pricing.sql)). If the row already exists, return `200 OK` immediately — Stripe retries safely.
- Handle these events at minimum:
  - `checkout.session.completed` → upsert `subscriptions` row with `stripe_customer_id`, `stripe_subscription_id`, `tier`, `status='active'`, `period_end`. Top up `credits.balance` to the tier allowance immediately (so the user doesn't wait for the next refresh cycle).
  - `customer.subscription.updated` → mirror tier + `status` + `period_end` into `subscriptions`. If status flips to `past_due` or `canceled`, **don't** downgrade immediately — see grace period below.
  - `customer.subscription.deleted` / `invoice.payment_failed` → start grace period (see 1.4).
  - `invoice.paid` → on the renewal cycle, refresh `credits.balance` to the tier allowance (no rollover per spec §5.1).

### 1.3 Customer Portal

- `apps/web/src/app/api/billing/portal/route.ts` — POST creates a `billing_portal.sessions.create` for the signed-in user (look up `stripe_customer_id` from `subscriptions`), returns `{ url }`.
- Add a "Manage subscription" link on `/billing` that hits the portal route.

### 1.4 Grace period (3 days per spec §5.3)

- Don't downgrade tier on `subscription.deleted` / `invoice.payment_failed`. Instead set `subscriptions.status = 'past_due'` and `subscriptions.grace_until = now() + 3 days`.
- Read path: existing `getSnapshot()` in [apps/api/src/credits/store.ts](../../apps/api/src/credits/store.ts) needs to treat `past_due` with `grace_until > now()` as the user's purchased tier; only after grace expires do we fall back to `'free'`.
- Add a daily cron (or check-on-read) that flips `past_due` rows whose `grace_until < now()` to `canceled` and zeroes paid-tier privileges.

### 1.5 Local dev / testing

- Use Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` for local webhook delivery, log the resulting `whsec_...` into `.env`.
- Add a smoke test that creates a test-mode checkout session end-to-end with `stripe.checkout.sessions.create` then asserts the webhook flips a fixture user's tier.

### 1.6 Acceptance (from spec §5)

- [ ] User with 0 credits sees a working "Upgrade to Pro" CTA on `/billing` that goes to Stripe Checkout.
- [ ] On successful payment, balance is topped up to allowance and tier reflects in nav `UsageIndicator`.
- [ ] Webhook is idempotent — replaying the same `event.id` doesn't double-credit.
- [ ] Cancellation goes through the Customer Portal, grace window is 3 days (verified via test clock or fixture).

**Estimated work:** 1 day for the happy path, +1 day for grace-period logic and webhook idempotency hardening.

---

## 2. Anthropic daily spending guard (storyboard worker)

**Spec §3 (Architecture Review).** The `system_limits` table already seeds `anthropic_daily_limit_usd=25` and a running spend counter (commit `5ead1d6`), but the storyboard worker doesn't read or write either yet — the cap is currently advisory.

**Tasks:**
- After each Claude call in `workers/storyboard/src/generator.ts`, parse the `usage` block from the response, multiply by Sonnet 4.6 input/output rates, increment `system_limits[anthropic_daily_spend_usd]`.
- Before kicking off a Claude call, read `anthropic_daily_spend_usd` and `anthropic_daily_limit_usd`. If spend ≥ limit, throw a typed error so the orchestrator marks the job failed with `STORYBOARD_BUDGET_EXCEEDED` and refunds 100%.
- Reset spend at UTC midnight (compare `anthropic_daily_reset_at`; if older than today UTC, set spend=0 before the next read).

**Risk if skipped:** unbounded Claude API spend on a viral day. The credit gate caps render-seconds but not Claude calls (e.g. mock-mode + intent='very long' could be cheap to the user but expensive to us).

---

## 3. Per-user rate limiting (currently per-IP only)

**Spec §3 (Rate limit layers).** [apps/api/src/app.ts:43-48](../../apps/api/src/app.ts) registers `@fastify/rate-limit` with `keyGenerator: req => req.ip` only. The spec calls for layered limits (per-IP **and** per-user) so a logged-in attacker behind a VPN can't trivially bypass.

**Tasks:**
- Wrap `@fastify/rate-limit`'s `keyGenerator` to prefer `req.headers['x-user-id']` when present, fall back to `req.ip`.
- Different `max` per tier: free=10/min, pro=30/min, max=120/min — read tier from session, multiply against tier-aware key.

---

## 4. History page polish (spec §4.2 — partially shipped)

Shipped: basic `/history` page + `HistoryGrid` component, thumbnail placeholder, relative time.

**Missing per spec §4.2:**

| Feature | Status | Notes |
|---|---|---|
| First-frame thumbnail extraction | ❌ | Render worker should `ffmpeg -ss 00:00:01 -frames:v 1` after MP4 upload, push as `jobs/<jobId>/thumb.jpg`. Currently `thumbUrl` is null for everyone. |
| Status / duration / date-range filters | ❌ | Add query params + Postgres WHERE clauses to `/api/users/me/jobs`. |
| Full-text search on intent | ❌ | Postgres `tsvector` GIN index on `jobs.input->>'intent'`. |
| Cursor pagination (24/page) | ❌ | Currently returns the full set. Cursor on `created_at`. |
| List/grid toggle (mobile→list, desktop→grid) | ❌ | Tailwind `md:` breakpoint + a toggle button. |
| Regenerate lineage badge ("Regenerated from job X") | ❌ | We persist `parentJobId` already; UI just needs to render the link. |

**Acceptance §4.2:** "History loads 24 items in < 500ms (indexed query)" — not measured. Add an index on `(user_id, created_at DESC)` once cursor pagination ships.

---

## 5. Free-tier guardrails (spec §5.1)

The tier table promises these but they're not enforced:

- **Watermark on Free-tier renders.** Render worker should branch on `tier === 'free'` (passed from orchestrator into the render job payload) and overlay a small bottom-right "Made with PromptDemo" mark in the Remotion composition.
- **History retention by tier.** Free=30d, Pro=90d, Max=365d. Add a daily cron that deletes (or soft-deletes) `jobs` rows + their S3 objects beyond the retention window. **Coordinate with Object Lifecycle Management** (next item) — cheaper to let cloud-storage rules do the S3 part and only run a SQL DELETE on the metadata.

---

## 6. Object Lifecycle Management for S3/MinIO (Amendment B)

**Spec Amendment B.** Crawl/storyboard/render artifacts pile up in MinIO/S3 forever right now. We promised lifecycle rules over app-level deletion.

**Tasks:**
- Add `lifecycle.json` for prod S3 (or GCS equivalent): expire `jobs/*/crawlResult.json` and `jobs/*/storyboard.json` after 7 days, MP4s after 365 days (longest tier retention).
- For MinIO local dev: `mc ilm import promptdemo-bucket lifecycle.json` is enough; document in [docs/readme/design-decisions.md](../readme/design-decisions.md).

---

## 7. Acceptance criteria not yet validated

These are from the spec's "Acceptance" sub-sections — features may already work, but we haven't run the test:

| Acceptance criterion | Source | How to validate |
|---|---|---|
| Lighthouse a11y ≥ 95 | §3 | Run Lighthouse on `/`, `/history`, `/billing` |
| Dark mode CLS = 0 | §3 | Lighthouse perf profile in dark mode |
| Refund within 30s of failed render | §5 | Force a render failure (bad storyboard URI), watch `credit_transactions` |
| History 24 items < 500ms | §4 | Seed 24 jobs, time the API call |

---

## 8. Nice-to-haves explicitly out of scope for v2.0

Listed so we don't accidentally re-promise:

- **GitHub OAuth** (spec §4.1 mentions Google + GitHub; we shipped Google only — GitHub is a one-line add when needed).
- **Bento variant** (spec Amendment D — deferred to v2.1 explicitly).
- **API access for Max tier** (spec §5.1).
- **Email full-text search on intent** (covered under #4 history polish).
- **Localized Claude prompts** (spec Option C in §2 stayed at "English body, Chinese label" — Chinese-language storyboards remain v2.1).

---

## What IS shipped (so we don't accidentally redo it)

For sanity, things the spec promised that ARE done:

- Feature 1: 4 FeatureCallout variants (image / kenBurns / collage / dashboard) + selection logic + Zod-validated schema.
- Feature 2: 5 intent presets, bilingual labels, dedup, append-mode precedence, telemetry.
- Feature 3: Theme toggle (3-state), 3-stage progress rail with **live intel**, micro-interactions, dark mode.
- Feature 4.1: NextAuth v5 + Google + Postgres adapter + AUTH_ENABLED flag.
- Feature 4.2: Skeleton + basic grid + relative time (gaps in #4 above).
- Feature 4.3: Regenerate with hint via `parentJobId` + server-authoritative crawl-skip.
- Feature 5 (minus Stripe): credit ledger, transactional debit/refund, concurrency cap, 402/429/403 responses, `UsageIndicator` pill, `/billing` page with disabled upgrade CTAs, refund hook on job failure per Amendment C.
- Postgres dual-write + canonical schema (Amendment A).
- Live-intel SSE (spec §3.3 — better than promised: workers emit phase messages now, not just stage transitions).
- Demo orchestration: direct-node spawn, port-based liveness, db:reset / db:tables, full-stack `pnpm demo` lifecycle, terminal-flash hidden on Windows.

---

**TL;DR:** the only blocker to a real launch is **Stripe (§1)**. Everything else is polish or defense-in-depth.
