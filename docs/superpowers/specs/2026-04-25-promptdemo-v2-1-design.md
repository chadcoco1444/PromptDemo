# LumeSpec v2.1 — Hardening + UX Polish Design Spec

**Status:** as-built. Phases 1–5 shipped 2026-04-25.

**Scope source:** user-supplied PRD ([prompt transcript](#)), reviewed via `superpowers:brainstorming`. Phase 5 was empty in the PRD; its body was answered to the items in [docs/superpowers/remaining-work.md](../remaining-work.md) §2 + §3.

**Goal.** Close the X-User-Id spoofing window, kill the locale-flicker bug, harden the Claude prompt against scene-type hallucination, give intent a pacing dimension, simplify history-card status while showing crawl screenshots immediately, modernize the UI with framer-motion physics, and add an Anthropic daily spend cap with per-user rate limiting.

**Tech additions:** `jose` (JWT), `framer-motion` (physics motion), `@aws-sdk/client-s3` in apps/web (cover proxy), `pg` in workers/storyboard (spend guard).

---

## Phase 1 — Security & bugs (shipped 3037734)

### 1.1 X-User-Id → trusted JWT

**Problem.** Plaintext `X-User-Id` was trusted by Fastify. Anyone reaching apps/api directly could forge any userId.

**Decision.** HS256 JWT signed with `INTERNAL_API_SECRET` at the Next.js BFF, verified at Fastify. 60s exp, `iss=lumespec-web`, `aud=lumespec-api`. Plain `X-User-Id` is rejected unconditionally when `requireUserIdHeader=true`.

**Tradeoffs considered:**
- **A) JWT (chosen)** — Standard, libraries handle replay window via exp. ~30KB jose.
- B) Mutual TLS — heaviest, requires PKI for local dev too.
- C) Shared header secret + raw userId — saves the JWT round-trip but no per-request tamper detection (a leaked token = forever forgeable).

**Files:**
- `apps/web/src/lib/internalToken.ts` — `signInternalToken(userId)`
- `apps/api/src/auth/internalToken.ts` — `verifyInternalToken(authHeader)`
- BFF rate limit: `apps/web/src/lib/rateLimitProxy.ts` (sliding window, in-memory, key = `${ip}:${userId ?? 'anon'}`, default 20/min)

### 1.2 Locale lock

**Decision.** `useState<SupportedLocale>('en')`. Removed `detectLocale` function and `navigator.language` sniff. Toggle button is the only path to `'zh'`. Removed three `suppressHydrationWarning` markers that existed solely to mask the swap.

**Tradeoff accepted:** zh users see English on first paint. Spec author judged this acceptable given the SSR/CSR mismatch + flash-of-English was worse.

### 1.3 Windows hidden launcher

**Decision.** Wrote `scripts/start-hidden.vbs` (20 lines) that runs `pnpm lume start` with `windowStyle=0`. Defense-in-depth supplement to the `windowsHide:true` flags shipped in `a0b0d0d`. Completed within timebox.

---

## Phase 2 — Storyboard prompt engineering (shipped 426dbb4)

### 2.1 Whitelist hardening

**Problem.** Claude was hallucinating unimplemented scene types (CursorDemo, BentoGrid, UseCaseStory, StatsBand, HeroStylized) because the full catalog was visible in the prompt.

**Decision.** `AVAILABLE_SCENES_PROMPT` constant in `sceneTypeCatalog.ts` is hand-assembled from `V1_IMPLEMENTED_SCENE_TYPES` only. Test asserts no unimplemented type leaks into the SCENE TYPES section of the prompt.

### 2.2 Pacing profiles

**Decision.** Three profiles, keyword-detected from intent:
- `marketing_hype` — `maxSceneFrames=60`, mandatory TextPunch interleave, system prompt addition: *"CRITICAL: high-energy trailer. Fast cuts only."*
- `tutorial` — `minSceneFrames=120`, FeatureCallout-heavy, *"CRITICAL: instructional video. Pacing must be methodical."*
- `default` — no caps

Bilingual keyword lists (en + zh). First-match-wins, hype precedence over tutorial when both match.

**Tradeoff considered:**
- **A) Keyword detection (chosen)** — deterministic, debuggable, free at runtime.
- B) LLM-based intent classification — higher latency, budget cost, brittle to prompt variations.
- C) Explicit profile dropdown in UI — best UX but expands the form footprint and adds a setting users won't always tweak.

### 2.3 Profile-aware Zod

**Decision.** `zodValidate(input, {profile})` runs the standard schema check, then walks scenes against the profile's frame caps. Cap violations surface as validation issues — feeds back through `generator.ts`'s existing 3-attempt retry loop without special-casing. After 3 failures, the job fails with the standard storyboard-error path (50% refund per Amendment C).

---

## Phase 3 — History page (shipped 777372c)

### 3.1 Three-state badges

**Decision.** Collapse 7 raw statuses into 3 user-visible buckets:
- `Generating`: queued / crawling / generating / waiting_render_slot / rendering
- `Done`: status=done
- `Failed`: status=failed

**Why three (not two):** discussed during brainstorm — the spec wording said "Generating + Done" but `failed` is a terminal state, not in-flight. Erasing it hurts user trust. User confirmed three states.

### 3.2 Crawl-screenshot cover (Snapshot Intercept)

**Decision.** As soon as `crawl_result_uri` is non-null on a job, the API returns a `coverUrl` pointing at `/api/jobs/[jobId]/cover` — a Next.js route that proxies the viewport screenshot from S3 (auth-gated, ownership-checked, 5-min private cache).

History card renders the cover dimmed (`opacity-70` + black overlay + pulse "Generating" pill) while in-flight, swaps to full opacity once render completes. Falls back to `thumbUrl` (post-render frame extract) when present.

**Architecture trade:** the cover route uses path-style S3 GET via `@aws-sdk/client-s3` installed in apps/web. We don't presign-and-redirect (extra round-trip); we stream bytes directly. Cache headers are `private, max-age=300` since the screenshot is immutable post-crawl.

**Why deterministic key (not crawlResult.json lookup):** the crawler always writes to `jobs/<jobId>/screenshots/viewport.jpg`. Skipping the JSON parse saves an S3 GET per history-page render.

---

## Phase 4 — UI/UX Pro Max (shipped 97106b3)

**Library decision.** framer-motion. Discussed in brainstorm as A/B/C; chose A for spring physics + DX. ~30KB gzipped. Already React 18-compatible.

**Pieces:**
- **Inter font** via `next/font/google` (self-hosted, font-display:swap, no FOUT).
- **Glassmorphism nav**: sticky, semi-transparent (`bg-white/70 dark:bg-gray-900/70`), `backdrop-blur-md`, subtle border opacity.
- **Glassmorphism StageRail**: same backdrop-blur recipe, brand-tinted shadow halo (`shadow-brand-500/5`).
- **MagneticButton**: framer-motion `useMotionValue` + `useSpring` (stiffness 200, damping 18, mass 0.4). Tracks pointer within 80px radius at strength 0.4. Springs back to (0,0) on leave. `whileTap={{scale:0.97}}`. Wraps the primary "Create video" CTA. Keyboard users see a normal button (no pointer = no translate).
- **SpringTextarea**: `motion.textarea` with spring-animated height (96px → 280px clamped). Stiffness 220, damping 22, mass 0.5. Replaces abrupt scrollbar appearance.
- **Breathing StageRail**: `animate-breathe-glow` keyframe (1.6s box-shadow loop, brand-color halo expanding then fading) on the active stage dot. Replaces generic `animate-pulse`.
- **Cross-fade intel**: `AnimatePresence mode="wait"` wraps the live-intel subtitle. Each new message: opacity 0→1 + y 6→0 over 180ms. Old message exits opacity 1→0 + y 0→-6. **No flash-replace.**

**Rejected.** No motion-design changes to ThemeToggle, AuthButton, UsageIndicator, ErrorCard — the PRD scope was form + StageRail.

---

## Phase 5 — Defense in depth (shipped this commit)

### 5.1 Anthropic daily spend guard

**Source.** [docs/superpowers/remaining-work.md](../remaining-work.md) §2 — `system_limits` was seeded but unread.

**Decision.**
- Pre-flight: `assertBudgetAvailable(pool)` before each Claude call. Reads spend + limit + reset_at inside a `SELECT FOR UPDATE` transaction. Resets spend to 0 if reset_at marker is from a prior UTC day.
- Post-flight: `recordSpend(pool, usage)` increments by computed USD via atomic numeric UPDATE.
- Budget rejection: `BudgetExceededError` with code `STORYBOARD_BUDGET_EXCEEDED`. Generator surfaces this; orchestrator's refund hook gives 100% (we never paid for tokens). `calculateRefund` updated to recognize the error code.
- Pricing: env-overridable rates, defaults match Sonnet 4.6 ($3/M input, $15/M output, 10% cache-read, 125% cache-creation).
- Off by default. `BUDGET_GUARD_ENABLED=true` + `DATABASE_URL` opt in.

**Tradeoff accepted:** worker restart between Claude call and `recordSpend` could under-count (no idempotency key per call). Risk: slight over-spend on rare crash. Mitigation: workers are short-lived (`lockDuration=60_000`); rate of restart-mid-call is near zero.

### 5.2 Per-user rate limit at Fastify

**Source.** [docs/superpowers/remaining-work.md](../remaining-work.md) §3 — Fastify keyGenerator was IP-only.

**Decision.** keyGenerator first verifies the JWT (same HS256 secret as Phase 1.1), buckets by `user:<id>` when valid. Falls back to `ip:<ip>` for anonymous + invalid-token requests. Independent quotas per user from the same IP — one tenant burning their bucket can't lock out another.

**Defense in depth.** BFF rate limit (Phase 1.1) covers `/api/jobs/create` only. Fastify-side covers every route apps/api exposes — catches traffic that bypasses the BFF.

---

## Test inventory

| Workspace        | Tests | Δ this session |
|------------------|-------|----------------|
| apps/api         | 65    | +13 (JWT verifier, post-job behavior, per-user RL) |
| apps/web         | 91    | +9 (rate-limit-proxy, HistoryGrid, useJobStream intel) |
| workers/storyboard | 95  | +30 (pacingProfiles, profile Zod, pricing, spendGuard, claudeClient.usage) |
| workers/crawler  | 47    | 0 |
| workers/render   | 8     | 0 |
| packages/schema  | 54    | +4 (intel) |
| packages/remotion| 25    | 0 |
| scripts          | 5     | 0 |
| **Total**        | **390** | **+56** |

Typecheck: clean across all 8 workspaces with `exactOptionalPropertyTypes: true`.

---

## What's NOT in this spec

Carried forward from [remaining-work.md](../remaining-work.md):

- **Stripe integration** — deferred until production deploy per user instruction. Full plan in remaining-work §1.
- **History polish** — thumbnail extraction, filters, full-text search, cursor pagination beyond skeleton. Cover proxy from Phase 3.2 covers the most painful gap.
- **Free-tier guardrails** — watermark + retention.
- **S3 lifecycle rules.**
- **Acceptance validation** — Lighthouse, refund-timing, history performance.

---

## Self-review

- **Placeholders:** none.
- **Internal consistency:** Phase 1.1 JWT secret is reused for Phase 5.2 keyGenerator — verified. Phase 5.1 refund delegates to Phase 1's `calculateRefund` extension — verified.
- **Scope:** single spec, five phases, ships as five commits. Appropriate granularity.
- **Ambiguity:** Phase 2.2 keyword precedence (hype before tutorial) is documented and tested. History 3-state vs 2-state was resolved in brainstorm (3 chosen).

---

**As-built commits:**
- Phase 1: `3037734`
- Phase 2: `426dbb4`
- Phase 3: `777372c`
- Phase 4: `97106b3`
- Phase 5 + spec: this commit
