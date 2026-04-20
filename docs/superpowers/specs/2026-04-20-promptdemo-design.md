# PromptDemo — Design Spec

**Date:** 2026-04-20
**Repository:** https://github.com/chadcoco1444/PromptDemo
**Status:** Brainstorm complete, awaiting user review before implementation planning.

## Summary

PromptDemo is an automated demo-video generation system. Input: a target URL, a user intent, and a duration (10s / 30s / 60s). Output: a rendered MP4 demo video. The pipeline crawls the target site, generates a structured storyboard via Claude, then renders with Remotion.

This spec captures the decisions made during brainstorming — what we're building, why, and what tradeoffs we accepted.

## Decisions Locked During Brainstorming

| # | Topic | Decision |
|---|-------|----------|
| 1 | Visual strategy | **Hybrid**: real screenshots in opening/closing scenes, stylized re-draws in the middle feature sections. |
| 2 | Scene type system | **Fixed enum (10 types) + rich props**. AI cannot invent new types. |
| 3 | Crawler failure strategy | **Graceful degradation (Tier B)** for MVP. Tier-C (human-in-loop) schema reserved, not implemented. |
| 4 | Delivery architecture | **Async job queue + SSE** via Redis/BullMQ, workers on Cloud Run. |
| 5 | Regeneration | **Regenerate with hints** (reuse parent crawl result). Scene-lock schema reserved, not implemented. |
| 6 | Copy source | **Extractive only**. All scene text must fuzzy-match the crawler's `sourceTexts` whitelist. No AI-invented feature claims. |
| 7 | Cursor paths | **Semantic props only** (`action` + `targetHint.region`). Remotion component computes the Bézier path internally. |

## §1 — System Architecture & Data Flow

### Pipeline

```
[API Gateway]
    │ POST /jobs { url, intent, duration }
    ▼
[Job Orchestrator] ──── SSE ────► [Client]
    │                               ▲
    ├──► Stage 1: Crawler Worker    │
    │    (Playwright → SaaS → Cheerio)
    │    → CrawlResult             progress events
    │
    ├──► Stage 2: Storyboard Worker
    │    (Claude Sonnet 4.6 + Zod + extractive check + retry)
    │    → Storyboard JSON
    │
    └──► Stage 3: Render Worker
         (Remotion renderMedia in container)
         → MP4 uploaded to S3
```

### Component Boundaries

| Component | Responsibility | Input | Output |
|-----------|---------------|-------|--------|
| `crawler` | Screenshot + structured extraction + fallback tier tracking | `{ url }` | `CrawlResult` |
| `storyboard-ai` | Compose Claude prompt, call API, Zod-validate, extractive-check, retry | `CrawlResult + intent + duration` | `Storyboard` |
| `remotion-composition` | React component tree with Storyboard as `defaultProps` | `Storyboard` | rendered frames |
| `render-controller` | Trigger `renderMedia`, upload S3, update job | `Storyboard + jobId` | `{ videoUrl }` |
| `job-store` | Redis hash: job state / stage / fallback metadata | — | — |

### Stack

- **Monorepo:** pnpm workspaces
  - `apps/api` — Fastify + SSE
  - `apps/web` — frontend
  - `packages/schema` — shared Zod schemas (CrawlResult, Storyboard)
  - `packages/remotion` — composition package
  - `workers/crawler`
  - `workers/render`
- **API:** Node.js 20 + Fastify
- **Queue:** BullMQ on Redis
- **AI:** `@anthropic-ai/sdk`, model `claude-sonnet-4-6`, prompt caching on system prompt
- **Crawler:** Playwright (primary) + Screenshot SaaS rescue + Cheerio (final fallback)
- **Render:** Remotion 4.x in Docker container with Chrome deps
- **Deploy:** Cloud Run (API + crawler worker + render worker, each their own service)
- **Storage:** S3-compatible for screenshots, storyboard JSON, MP4 output. Workers authenticate via **IAM role attached to the Cloud Run service**; artifacts are accessed through internal `s3://` URIs via the SDK, not pre-signed HTTP URLs. Public-facing `videoUrl` for the final MP4 is a separate, bounded-TTL pre-signed URL generated at the end of the render stage.
- **Rate limiting:** API Gateway enforces per-IP request limits on `POST /api/jobs` (suggested: 10/minute/IP for MVP) to prevent runaway Cloud Run spend. Per-project CPU quotas must be confirmed with the cloud provider before load testing — a single burst of 50 concurrent jobs spawns 50 render worker instances.

## §2 — Scene Type Catalog & Storyboard Schema

### Scene Type Catalog (10 types)

| # | Type | Visual Mode | 10s | 30s | 60s | Purpose |
|---|------|-------------|-----|-----|-----|---------|
| 1 | `HeroRealShot` | real | ✓ | ✓ | ✓ | Opening — real screenshot + overlay title |
| 2 | `HeroStylized` | stylized | ✓ | ✓ | ✓ | Opening fallback when screenshot unavailable |
| 3 | `FeatureCallout` | stylized | ✓ | ✓ | ✓ | Single feature focus, split layout |
| 4 | `CursorDemo` | stylized | — | ✓ | ✓ | Simulated cursor interaction |
| 5 | `SmoothScroll` | real | — | ✓ | ✓ | Long-page scroll showcase |
| 6 | `UseCaseStory` | stylized | — | — | ✓ | Three-beat narrative: Before → Action → After |
| 7 | `StatsBand` | stylized | — | ✓ | ✓ | Numeric callout band |
| 8 | `BentoGrid` | stylized | — | ✓ | ✓ | Dense feature grid (3–4 icons + labels) |
| 9 | `TextPunch` | text-only | ✓ | ✓ | ✓ | Full-screen text beat for pacing |
| 10 | `CTA` | real + overlay | ✓ | ✓ | ✓ | Closing — logo + domain + call to action |

**Transitions are NOT a scene type.** Each scene has required `entryAnimation` / `exitAnimation` enum values; Remotion's `<TransitionSeries>` handles overlap automatically. This avoids timeline-calculation bugs where transition scenes create visual discontinuity.

### Storyboard Schema (Zod, semantic sketch)

```ts
Storyboard = {
  videoConfig: {
    durationInFrames: number,   // 300 | 900 | 1800
    fps: 30,
    brandColor: string,          // hex
    logoUrl?: Url,
    bgm: 'upbeat' | 'cinematic' | 'minimal' | 'tech' | 'none',
  },
  assets: {
    screenshots: {
      viewport?: S3Url,           // 1280x800 first-screen
      fullPage?: S3Url,           // full-page screenshot for SmoothScroll
      byFeature?: Record<string, S3Url>,
    },
    sourceTexts: string[],         // whitelist for extractive AI
  },
  scenes: Scene[],                 // discriminated union on `type`
}

Scene = {
  sceneId: number,
  type: SceneTypeEnum,             // one of the 10
  durationInFrames: number,
  entryAnimation: AnimationEnum,   // required
  exitAnimation: AnimationEnum,    // required
  locked?: boolean,                // reserved for future scene-lock feature
  props: TypeSpecificProps,        // discriminated on `type`
}

AnimationEnum = 'fade' | 'slideLeft' | 'slideRight' | 'slideUp' | 'zoomIn' | 'zoomOut' | 'none'
```

### Key Schema Principles

- `assets` is separate from `scenes`. Crawler products are centralized; scenes reference by key.
- `sourceTexts` is the AI's text whitelist — no invented feature claims.
- Per-scene `props` is a discriminated union; Zod validates strictly.
- `locked` field is reserved (future scene-lock feature from decision #5).
- Duration routing (which scene types appear at each length) is enforced by **prompt instructions**, not schema — preserves flexibility for future formats (e.g., 15s TikTok).

## §3 — API Shape & Job Data Model

### Endpoints

```
POST /api/jobs
  body: { url, intent, duration, parentJobId?, hint? }
  → 201 { jobId }

GET /api/jobs/:jobId
  → 200 Job

GET /api/jobs/:jobId/stream   (SSE)
  event: progress      data: { stage, pct, message }
  event: stage_done    data: { stage, artifact }
  event: fallback      data: { reason, replaced }
  event: queued        data: { position, aheadOfYou }
  event: done          data: { videoUrl, fallbacks[] }
  event: error         data: { code, message, retryable }

GET /api/jobs/:jobId/storyboard   (debug / future scene-lock)
  → 200 Storyboard

POST /api/jobs/:jobId/assets      (RESERVED for future Tier-C fallback; not in MVP)
  body: { missingField, value }
  → 204
```

### Job Data Model (Redis hash + S3 artifacts)

```ts
Job {
  jobId: string                    // nanoid
  parentJobId?: string             // for regenerate-with-hint
  status: 'queued' | 'waiting_render_slot' | 'crawling' | 'generating' | 'rendering' | 'done' | 'failed'
  stage: 'crawl' | 'storyboard' | 'render' | null
  progress: 0..100

  input: { url, intent, duration, hint? }
  crawlResult?: S3Url              // JSON in S3
  storyboard?: S3Url               // JSON in S3
  videoUrl?: string                // MP4 in S3

  fallbacks: Array<{ field, reason, replacedWith }>
  error?: { code, message, retryable }

  createdAt: number
  updatedAt: number
  ttl: 7 days
}
```

### Design Notes

- **`parentJobId` semantics:** when POST `/jobs` includes `parentJobId`, the backend skips the crawl stage, copies `crawlResult` from the parent, and reruns storyboard + render. Saves ~30s of crawling and avoids retriggering bot detection on the target site.
- **Regenerate flow uses `hint`:** user supplements intent with a hint ("second scene is too slow"); this appears in the user message for the retry Claude call.
- **SSE over WebSocket:** unidirectional progress only needs one-way push; SSE is lighter, proxy-friendly, and has built-in reconnect. Keeps the API language-neutral for future non-JS clients.
- **S3 artifacts separate from Redis:** crawl results and storyboards can exceed 100KB (base64 long-page screenshots balloon fast). Redis stores only S3 keys.
- **7-day TTL:** balances debugging convenience with storage cost.

### BullMQ Flow

```
[crawl queue] → [storyboard queue] → [render queue]
     │                 │                    │
  retry×2          retry×2 (on           retry×1 (on
  then fail       Zod / extract fail)    renderMedia fail)
  (or Track-2     then fail               then fail
  rescue)
```

### Global Backpressure (Two-Layer Protection)

Per-IP rate limiting at the API Gateway stops single bad actors but does nothing for a viral spike where 100 distinct real users all POST `/jobs` within a minute. That would spawn 100 render worker instances and blow past cloud-account vCPU quotas.

Second layer: **BullMQ Queue-level concurrency cap** on the render queue — at most N jobs in `active` state globally (suggested MVP: 20). Jobs beyond the cap sit in `waiting` state and don't trigger Cloud Run scale-out. The API response and SSE stream expose the queue position so the UI can show "Queued — position 5 of 23" instead of silently hanging.

New SSE event:
```
event: queued   data: { position: 5, aheadOfYou: 4 }
```

Sent once when a job enters waiting state beyond the active cap, and updated whenever the position changes.

## §4 — Crawler Strategy & Fallback Tiers

### CrawlResult Contract

```ts
CrawlResult {
  url: string,
  fetchedAt: number,
  screenshots: {
    viewport?: S3Url,
    fullPage?: S3Url,
  },
  brand: {
    primaryColor?: string,
    secondaryColor?: string,
    logoUrl?: S3Url,                 // downloaded + re-hosted on our S3
    fontFamily?: string,
    fontFamilySupported?: boolean,   // true if in @remotion/google-fonts whitelist
  },
  sourceTexts: string[],             // deduped, ≤200 chars each
  features: Array<{
    title: string,
    description?: string,
    iconHint?: string,               // from nearby img alt or svg
  }>,
  fallbacks: Array<{ field, reason, replacedWith }>,
  tier: 'A' | 'B' | 'C',
  trackUsed: 'playwright' | 'screenshot-saas' | 'cheerio',
}
```

### Three-Track Acquisition Strategy

| Track | Tech | Trigger | Capabilities | Cost |
|-------|------|---------|--------------|------|
| 1 | Playwright (self-hosted) | default | screenshots + DOM + color sampling | compute only |
| 2 | Screenshot SaaS (ScreenshotOne MVP) | Track 1 gets 403 / 429 / Cloudflare challenge / timeout | screenshots + HTML via residential IP | ~$0.001–0.01/call |
| 3 | Cheerio | Track 2 also fails, or only meta tags needed | og:image + meta tags only | compute only |

**Why three tracks:** datacenter IPs from Cloud Run trigger WAF bans on Cloudflare / Datadome / Akamai–protected sites. Dropping straight to Cheerio after Playwright fails doesn't help — Cheerio's raw HTTP request gets the same 403. The SaaS rescue, with residential IP pools and CAPTCHA handling, covers this gap.

### Fallback Tiers (MVP implements A + B)

| Tier | Condition | Behavior | Video Impact |
|------|-----------|----------|--------------|
| **A** | Any track succeeds with full data | All 10 scene types available | Full hybrid mode |
| **B** | Any track partial success | Auto-substitute: missing `brandColor` → `#1a1a1a`; missing `logoUrl` → domain-initial generated logo; missing screenshot → all RealShot scenes downgrade to Stylized variants | Video renders but "less like" the target site |
| **C** | All tracks fail / no text extracted | `failed` status with error code (MVP). Future: switch to `awaiting_user_input` | User sees error |

### Extraction Details

- **Primary color:** `fast-average-color` sampling on key DOM elements (buttons, header, primary links), frequency-ranked. Do NOT average the whole screenshot — produces lifeless grey-brown.
- **Logo detection:** three candidates (`<img alt*="logo">`, `link[rel="icon"]`, `header img`); pick the largest.
- **Source texts:** title, meta description, H1–H3, strong text, feature bullet lists. Dedupe. Truncate >200 chars.
- **Text normalization (critical):** both the crawler AND the extractive checker must run the exact same normalization before comparing — decode HTML entities, strip zero-width / control chars, collapse whitespace, NFKC unicode normalize, lowercase. The normalized form is what lands in `sourceTexts` and what Fuse.js matches against. Without this, Claude's clean output fails the match and triggers needless retries. Normalization function lives in `packages/schema/src/normalizeText.ts` and is imported by both the crawler and the storyboard worker.
- **Cookie banners:** maintained selector list (OneTrust, Cookiebot, common custom patterns); auto-dismiss before screenshot.
- **Env flag:** `CRAWLER_RESCUE_ENABLED=false` disables Track 2 (local dev saves cost).
- **All S3 uploads happen in crawl stage.** Render worker only reads from S3.
- **No pre-signed URLs for inter-stage artifacts.** The `S3Url` type in `CrawlResult` is actually a `s3://bucket/key` URI. All workers load via IAM-authenticated SDK calls, so there's no TTL to manage across queued jobs.
- **Docker PID 1 hygiene for Playwright:** the crawler worker Dockerfile uses `tini` (or `dumb-init`) as entrypoint. Headless Chromium spawned by Playwright frequently leaves orphan processes; without a proper init reaper they accumulate as zombies and OOM the container over time. `ENTRYPOINT ["/usr/bin/tini", "--"]` fixes this and costs nothing.

## §5 — AI Prompt Structure & Validation

### Three-Part Prompt with Caching

```
┌─────────────────────────────────────────┐
│ System Prompt  (cached — ~3–5K tokens)  │
│   - Role: storyboard editor              │
│   - Scene Type catalog (10 + props)      │
│   - Hard rules:                          │
│     · text must come from sourceTexts   │
│     · scene.type must be enum           │
│     · durationInFrames total = target   │
│     · no invented features              │
│   - Rhythm templates for 10s / 30s / 60s│
│   - Output: pure JSON, no markdown       │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ User Message  (changes per call)        │
│   - intent: <user input>                │
│   - duration: 10 | 30 | 60              │
│   - crawlResult: { brand, sourceTexts, │
│                    features, assets }   │
│   - (if regenerate) previousStoryboard  │
│                   + hint                │
└─────────────────────────────────────────┘
```

**Prompt caching:** system prompt uses `cache_control: { type: "ephemeral" }`. Saves ~90% input token cost across repeated calls.

**Model:** `claude-sonnet-4-6`. Sonnet's structured-output and constraint-following beats Haiku for this workload, and is dramatically faster than Opus for a latency-sensitive flow.

### Validation Pipeline

```
Claude response → [1] JSON.parse
                    ↓ fail → retry with parser error (max 2)
                  [2] Zod schema validation (enum, props, types)
                    ↓ fail → retry with Zod error messages
                  [3] Extractive check (every scene text must
                     match sourceTexts — language-aware)
                     - Latin-script text: Fuse.js, threshold 0.3
                     - CJK text (detect via unicode range): fall back
                       to normalized substring/N-gram match
                       (Fuse.js defaults tokenize on whitespace and
                        misbehave without word boundaries)
                    ↓ fail → retry, naming violating phrases
                  [4] Duration check
                     - If |sum − target| ≤ 5% → auto-prorate
                       to longest scene (no retry!)
                     - If > 5% → retry
                  [5] Pass → persist storyboard, trigger render
```

**Duration auto-adjust rationale:** LLMs are weak at precise arithmetic and frequently produce sums off by a handful of frames. Retrying for ~10-frame errors costs tokens and seconds for no quality gain. Instead, we prorate the delta onto the longest `FeatureCallout` / `HeroRealShot` / `SmoothScroll` scene. Only real failures (>5%) trigger retry.

### Retry Policy

- Errors from [1]–[4] are appended to the user message on retry. Claude self-corrects on most second attempts.
- Max 3 retries total across the pipeline (not per step).
- Exhausted retries → `failed` status, error code `STORYBOARD_GEN_FAILED`.

### Regenerate with Hint

When `parentJobId` + `hint` provided:
- User message includes `previousStoryboard` and `hint`.
- System prompt appends: *"User was unsatisfied with the previous storyboard. Adjust according to the hint. Keep what worked."*

## §6 — Remotion Component Architecture

### Package Layout (`packages/remotion`)

```
src/
├── Root.tsx                     ← registerRoot; Composition; font loading
├── MainComposition.tsx          ← consumes Storyboard as defaultProps
│
├── scenes/                      ← one file per scene type
│   ├── HeroRealShot.tsx
│   ├── HeroStylized.tsx
│   ├── FeatureCallout.tsx
│   ├── CursorDemo.tsx
│   ├── SmoothScroll.tsx
│   ├── UseCaseStory.tsx
│   ├── StatsBand.tsx
│   ├── BentoGrid.tsx
│   ├── TextPunch.tsx
│   └── CTA.tsx
│
├── primitives/
│   ├── BrowserChrome.tsx        ← browser window frame (URL bar, buttons, shadow)
│   ├── Cursor.tsx               ← semantic → Bézier path cursor
│   ├── LogoMark.tsx             ← domain-initial fallback logo
│   ├── AnimatedText.tsx         ← spring character fade / typewriter
│   ├── BGMTrack.tsx             ← background music with fade-in/out
│   └── SFXPlayer.tsx            ← sound effects (used inside Cursor for click)
│
├── animations/
│   ├── timing.ts                ← enum → Remotion timing function mapping
│   ├── entryExit.ts             ← entryAnimation enum → TransitionSeries presentation
│   └── easings.ts
│
├── assets/
│   ├── bgm/                     ← royalty-free tracks keyed by mood enum
│   │   ├── upbeat.mp3
│   │   ├── cinematic.mp3
│   │   ├── minimal.mp3
│   │   └── tech.mp3
│   └── sfx/
│       └── click.mp3
│
├── fonts.ts                     ← @remotion/google-fonts loader + delayRender
│
└── utils/
    ├── resolveScene.tsx         ← discriminated union dispatcher
    └── brandTheme.ts            ← derive palette from brandColor
```

### Composition Skeleton

```tsx
export const MainComposition: React.FC<Storyboard> = ({ videoConfig, assets, scenes }) => (
  <ThemeProvider brand={videoConfig}>
    {videoConfig.bgm !== 'none' && (
      <BGMTrack mood={videoConfig.bgm} durationInFrames={videoConfig.durationInFrames} />
    )}
    <TransitionSeries>
      {scenes.map((scene, i) => (
        <React.Fragment key={scene.sceneId}>
          <TransitionSeries.Sequence durationInFrames={scene.durationInFrames}>
            {resolveScene(scene, assets)}
          </TransitionSeries.Sequence>
          {i < scenes.length - 1 && (
            <TransitionSeries.Transition
              presentation={entryExitToPresentation(scenes[i + 1].entryAnimation)}
              timing={linearTiming({ durationInFrames: 15 })}
            />
          )}
        </React.Fragment>
      ))}
    </TransitionSeries>
  </ThemeProvider>
);
```

### Key Implementation Decisions

- **`resolveScene` dispatcher** uses discriminated union switch; TypeScript enforces exhaustiveness (missing a scene type won't compile).
- **Cursor primitive** takes `{ action, targetHint: { region } }`. Internally: spring path from current screen focal point to region anchor, plus micro-jitter and click ripple. Plays click SFX on `action === 'Click'`.
- **BrowserChrome primitive** wraps `HeroRealShot` / `SmoothScroll` / `CTA`, giving screenshots a product-feel frame.
- **ThemeProvider + brandTheme.ts:** derives palette (primary / primaryLight / primaryDark / textOn / bg) from `brandColor`. Scenes consume via CSS variables — re-skinning is automatic.
- **Defensive Zod at component level:** each scene re-validates its props. Guards against manual edits in Remotion Studio.

### Font Loading

- `fonts.ts` uses `@remotion/google-fonts` when `brand.fontFamilySupported === true`; falls back to `Inter` otherwise.
- `Root.tsx` wraps `delayRender('font-loading')` → `continueRender()` around font availability to prevent text flicker and dropped frames.

### Audio

- **BGM:** not scraped (copyright risk). Bundled royalty-free tracks under `assets/bgm/`, keyed by `videoConfig.bgm` enum. Claude picks the mood that matches the intent. Auto fade-in/fade-out at composition edges.
- **SFX:** bundled click sound, played by `Cursor` on click actions.

### Render Execution

- Worker container: `node:20` base + Chrome deps + bundled Remotion.
- `render-controller.ts` calls `renderMedia()` API directly (not CLI) to get the buffer and upload to S3.
- Concurrency: one job per worker (Remotion saturates CPU). **Two layers must both be set:**
  - Cloud Run HTTP `concurrency=1` (for any HTTP surface on the worker container).
  - BullMQ `Worker({ concurrency: 1 })` at code level. This is the critical one — BullMQ pulls jobs actively, so Cloud Run's HTTP concurrency does not constrain it. Without this, one instance can fork multiple FFmpeg processes and OOM.
- Output: H.264 MP4, 1280×720, 30fps.

## Development Ergonomics: Mock Mode

Crawling + Claude generation together cost roughly 30–50s per iteration. That's poison for frontend and Remotion-component development, where you want tight feedback loops.

**Mock mode** skips Stage 1 and Stage 2 entirely:

- `POST /api/jobs?mock=<fixtureName>` (or env-gated `MOCK_MODE=true`) bypasses the crawler and storyboard workers.
- `packages/schema/fixtures/` holds canonical fixtures:
  - `crawlResult.saas-landing.json`, `crawlResult.ecommerce.json`, `crawlResult.docs.json`
  - `storyboard.10s.json`, `storyboard.30s.json`, `storyboard.60s.json`
  - plus at least one `storyboard.tierB-fallback.json` so stylized-fallback paths are reachable without crashing real sites.
- The API goes straight to the render queue with the fixture's storyboard.
- Gated: only enabled when `process.env.NODE_ENV !== 'production'`. No prod footprint.
- Remotion Studio reads the same fixtures via `defaultProps`, so composition work is 100% offline — no API, no Redis, no S3 needed.

This cuts the component-tuning feedback loop from ~40s to ~2s.

## MVP Scope & Tool Choices (Locked)

- **v1.0 Scene Types (5):** `HeroRealShot`, `FeatureCallout`, `TextPunch`, `SmoothScroll`, `CTA`. Sufficient to assemble commercially-viable 30s demos. `BentoGrid`, `CursorDemo`, `UseCaseStory`, `StatsBand`, `HeroStylized` deferred to v1.1 — their spring-physics tuning is high-cost and best done after the core pipeline is stable.
- **Screenshot SaaS (Track 2):** ScreenshotOne. Residential proxy pool quality + out-of-the-box banner blocking are strong for the WAF-rescue use case.
- **Frontend:** Next.js 14 (App Router) at `apps/web`. Shares `packages/schema` Zod types with backend via pnpm workspace; leaves SSR open for future share-preview pages.

## Deferred to Later Iterations

- **v1.1 scene types:** `BentoGrid`, `CursorDemo`, `UseCaseStory`, `StatsBand`, `HeroStylized`. Their schema and prompt catalog entries remain defined so the storyboard validator is forward-compatible — only the Remotion components are skipped in v1.0.
- **Tier-C human-in-loop asset upload:** `awaiting_user_input` status + `POST /jobs/:id/assets` endpoint. Schema reserved; UI not built.
- **Scene-lock + partial re-roll:** `scene.locked?: boolean` reserved; no UI, no partial render. v1.0 regenerate = whole-storyboard re-roll with hint.
- **Additional durations:** duration routing lives in the prompt, not the schema; adding 15s TikTok or 2min explainer requires only prompt edits.

## Open Questions for Plan Phase

- BGM starter library — which specific royalty-free tracks and from which source (Uppbeat / Epidemic / self-produced)?
- Exact Cloud Run CPU quota for the target region — needs confirmation with cloud provider before first load test.
- Cloud Run vs Fly.io tradeoff for render workers — Fly.io's per-second billing may be cheaper for long renders; revisit after first cost measurement.
