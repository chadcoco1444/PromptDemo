# Feature 5 Pricing + Credits — Implementation Guide

**Status:** Plan-only. Awaiting Stripe keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_MAX`). `.env.example` skeleton shipped 2026-04-25.

## Tier model (v2.0 spec Amendment C)

All user-visible math is in **render-seconds**, not credits:

| Feature | Free | Pro ($19/mo) | Max ($99/mo) |
|---|---|---|---|
| Render seconds / month | 30s | 300s | 2000s + overage |
| Durations allowed | 10s, 30s | 10/30/60s | 10/30/60/120s |
| Overage rate | — | — | $0.05/sec |
| Concurrent jobs | 1 | 3 | 10 |
| Priority render queue | ❌ | ✅ | ✅ dedicated |
| History retention | 30d | 90d | 365d |

Internal storage (`credits` table) is integer seconds. UI labels convert to "X seconds remaining this month." No "credit" terminology in the UI.

## Scope

### What ships in Feature 5

1. **Stripe integration layer** — `apps/api/src/stripe/` module with:
   - `createCheckoutSession(userId, priceId)` → returns hosted-checkout URL
   - `createPortalSession(userId)` → returns customer-portal URL (self-service cancel/swap plan)
   - Webhook handler for `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`

2. **Credit enforcement middleware** — runs BEFORE `POST /api/jobs`:
   - `SELECT balance FROM credits WHERE user_id = $1 FOR UPDATE` inside a transaction
   - If balance < cost → 402 Payment Required + upgrade CTA
   - Else UPDATE balance - cost + INSERT into credit_transactions, COMMIT
   - Cost table: 10s video = 10 seconds debited, 30s = 30, etc.
   - On render failure: refund via `calculateRefund(stage, errorCode)` pure function

3. **Concurrency cap** — count active jobs per user:
   - `SELECT COUNT(*) FROM jobs WHERE user_id = $1 AND status IN ('queued', 'crawling', 'generating', 'waiting_render_slot', 'rendering')`
   - Free: 1, Pro: 3, Max: 10
   - Over limit → 429 + "plan allows N concurrent"

4. **`/billing` page** — tier display, upgrade button, usage this period, past invoices. Server component that reads `subscriptions` + `credits` + `credit_transactions` for the signed-in user.

5. **Usage indicator in nav** — small pill showing "180s left" when signed in. Refreshes on every client navigation.

6. **Anthropic daily spending guard** — `system_limits.anthropic_daily_spend_usd` row (runtime-updatable) that gates storyboard worker. Over budget → storyboard refuses new jobs until midnight UTC with `STORYBOARD_BUDGET_EXCEEDED`; users see error, credits auto-refunded. Prevents runaway API cost from abuse or bugs.

### What's out of scope

- Usage-based billing / metered overage charges via Stripe metered prices (Max tier overage is v2.1 — for v2.0, Max is hard-capped at 2000s).
- Team plans / seat-based pricing.
- Promo codes / discounts.
- Annual prepay discounts.
- In-app purchase of one-off video bundles (always subscription).

## Implementation tasks (ordered)

### Task 1: Stripe client + env plumbing (~1 hr)
- `pnpm --filter @lumespec/api add stripe`
- `apps/api/src/stripe/client.ts` — lazy singleton with env check
- `apps/api/src/lib/pricingEnabled.ts` — `isPricingEnabled()` + `assertPricingEnv()`
- Extend `assertAuthEnv()` logic: pricing requires auth (no credits without users)

### Task 2: Pricing schema migration (~30 min)
- `db/migrations/002_pricing.sql` — add `system_limits` table (`anthropic_daily_spend_usd`, `anthropic_daily_limit_usd`), any columns pricing needs on `subscriptions`
- Add seed row for `anthropic_daily_limit_usd` = 25 (conservative default)

### Task 3: Credit debit flow + tests (~1.5 hr)
- `apps/api/src/credits/ledger.ts` — pure function `calculateCost(duration): number`, `calculateRefund(stage, errorCode): number`
- `apps/api/src/credits/middleware.ts` — Fastify preHandler hook for `POST /api/jobs` that does the SELECT FOR UPDATE + UPDATE + INSERT in a transaction
- Tests with pg-mem or a test DB: happy path (sufficient balance), insufficient (402), refund on crawl failure (100%), refund on render failure (50%)

### Task 4: Concurrency cap middleware (~45 min)
- `apps/api/src/credits/concurrency.ts` — same transaction as debit, `SELECT COUNT(*) FROM jobs ...` + tier lookup
- Returns 429 with `Retry-After` header if over

### Task 5: Checkout + Portal routes (~1 hr)
- `POST /api/billing/checkout` → returns `{url}` from `createCheckoutSession`
- `POST /api/billing/portal` → returns `{url}` from `createPortalSession`
- Both require auth session

### Task 6: Webhook handler (~1.5 hr)
- `POST /api/webhooks/stripe` — raw-body signature verification, event dispatch
- `customer.subscription.updated` → UPDATE subscriptions SET tier, status, current_period_end
- `customer.subscription.deleted` → DOWNGRADE to free (3-day grace)
- `invoice.paid` → CREDIT refresh via INSERT credit_transactions { reason: 'refresh', delta: tierAllowance }
- `invoice.payment_failed` → status = 'past_due'
- Idempotency: persist processed event IDs in `stripe_events` table, ON CONFLICT DO NOTHING

### Task 7: `/billing` page (~1 hr)
- Server component: fetch subscription + credits + last 10 transactions
- Upgrade CTA → POST /api/billing/checkout → redirect to Stripe URL
- Manage CTA → POST /api/billing/portal → redirect

### Task 8: Usage indicator in nav (~30 min)
- Client component that fetches `/api/users/me/credits` on mount
- Pill in `<AuthButton>` area: "180s left" with color ramp (green/amber/red)

### Task 9: E2E + error-path tests (~1.5 hr)
- Integration test: sign in → submit 3 videos → 4th gets 402
- Integration test: render fails → refund lands within 30s
- Integration test: webhook fires → credit balance reflects

### Total: ~10 hours of focused work

## Enabling pricing locally

```bash
# 1. Create Stripe products + prices in the Stripe dashboard (Test mode)
#    - Product "LumeSpec Pro"       → Price id prod_XXXX / price_YYYY ($19/mo)
#    - Product "LumeSpec Max"       → Price id prod_ZZZZ / price_WWWW ($99/mo)

# 2. Populate .env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO=price_YYYY
STRIPE_PRICE_MAX=price_WWWW
PRICING_ENABLED=true
AUTH_ENABLED=true   # pricing requires auth — users are the subject of billing

# 3. Run db migration (Task 2 migration file)
docker compose -f docker-compose.dev.yaml down -v
docker compose -f docker-compose.dev.yaml up -d postgres

# 4. Forward Stripe webhooks to local dev (in a separate terminal)
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe
# Copy the displayed webhook signing secret → STRIPE_WEBHOOK_SECRET

# 5. Restart api + web services
pnpm lume restart
```

## Product decision log (locked)

- **Render-seconds, not credits, in the UI** — v2.0 Amendment C. Internal schema uses integer seconds via the `credits.balance` column; the UI formatter labels them as "X seconds." No user-facing concept of credits.
- **Database-backed Stripe event idempotency** — not in-memory because webhook replay during redeploy must dedupe.
- **Pricing requires auth** — no anonymous billing. Enforcing at module-load ensures PRICING_ENABLED=true without AUTH_ENABLED=true fails fast.
- **Free tier stays 30s/month** — generous enough to validate the product, small enough to force upgrade if they need more than ~1 video.
- **Max overage hard-capped** — `2000s + $0.05/sec up to 4000s, then hard stop` (v2.1 considers unbounded metered; v2.0 hard caps for predictability).
