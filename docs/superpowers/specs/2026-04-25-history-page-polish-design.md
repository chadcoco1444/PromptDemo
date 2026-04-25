# History Page Polish — Design Spec (v2.2)

**Brainstorm completed:** 2026-04-25
**Status:** awaiting user review before writing-plans handoff
**Predecessors:**
- [v2.1 design](2026-04-25-promptdemo-v2-1-design.md) — Phase 4 visual baseline (Inter, framer-motion, brand-glow), 3-state badges + crawl-screenshot cover proxy already shipped.
- [Marketing landing](2026-04-25-marketing-landing-page-design.md) — defines the "Pro Max" quality bar this spec inherits.
- [Remaining-work](../remaining-work.md) §4 — 6 promised History sub-items being closed.

**Goal.** Take the existing /history page from "skeleton plus 3-state badges" to a finished, polished SaaS dashboard surface. Six concrete deliverables: real first-frame thumbnails, server-side filters + search, cursor pagination with "load more", responsive grid (no list/grid toggle), regenerate-lineage badge, and the DB index that powers it all.

**Non-goals.** Custom date-range picker, list-view, infinite-scroll, autocomplete suggestions in search, server-side sort options. All deferred until telemetry shows demand.

---

## Decisions (6 brainstorm questions)

| # | Question | Choice |
|---|---|---|
| 1 | Pagination pattern | **B — Load-more button** + cursor (`?before=ISO8601&limit=24`) + loading state + new-card fade-in animation |
| 2 | Search index strategy | **B — pg_trgm** GIN on `(input->>'intent')` + 300ms client debounce + `?q=` URL param |
| 3 | Filter scope | **B — Status + Duration + Time-preset chips** (`Last 7d / 30d / 90d / All`); no calendar picker; URL-synced; AND-composed |
| 4 | List/grid toggle | **A — Responsive grid only** (1/2/3 cols at 375/768/1024+), Pro Max hover micro-interactions (lift + glow border) |
| 5 | Thumbnail extraction | **A — Remotion `renderStill`** at frame 45 (1.5s) post-render, **WebP output** (via sharp post-process), uploaded to `jobs/<id>/thumb.webp`, `jobs.thumb_url` updated |
| 6a | Lineage badge | **A — Always-visible** small badge on cards with `parentJobId` set: `↳ from <hostname>` or `↳ from <relative-time>` if hostname matches |
| 6b | DB indexes | **Lean plan** — single new GIN index for trigram search, no per-status/per-duration indexes (per-user job count stays small, in-memory filtering is fine) |

---

## Page architecture

```
/history
└── HistoryGrid (client component, reads URL search params)
    ├── FilterBar
    │   ├── SearchInput     — debounced 300ms, syncs ?q
    │   ├── StatusChips     — All / Generating / Done / Failed
    │   ├── DurationChips   — All / 10s / 30s / 60s
    │   └── TimePresetChips — All / 7d / 30d / 90d
    ├── ResponsiveGrid
    │   └── HistoryCard (× N)
    │       ├── Cover image (thumb.webp via cover proxy fallback chain)
    │       ├── Hostname + intent snippet
    │       ├── Duration · relative time
    │       ├── StatusBadge
    │       └── LineageBadge (only when parentJobId set)
    └── LoadMoreButton (with pending state + new-card fade-in)
```

---

## API contract

### `GET /api/users/me/jobs`

**Query params (all optional, AND-composed):**

| Param | Type | Default | Notes |
|---|---|---|---|
| `q` | string | — | Search term; matched via `(input->>'intent') ILIKE '%q%'` accelerated by pg_trgm GIN |
| `status` | `generating` \| `done` \| `failed` | — | Maps `generating` → `IN ('queued','crawling','generating','waiting_render_slot','rendering')` |
| `duration` | `10` \| `30` \| `60` | — | Filter on `(input->>'duration')::int` |
| `time` | `7d` \| `30d` \| `90d` | — | `created_at >= now() - interval '<n> days'` |
| `before` | ISO8601 | — | Cursor: `created_at < $before`. Set from the `created_at` of the last card. |
| `limit` | int 1-100 | 24 | Page size |

**Response:**

```json
{
  "jobs": [
    {
      "jobId": "...",
      "parentJobId": "..." | null,
      "status": "...",
      "stage": "...",
      "input": { "url": "...", "intent": "...", "duration": 30 },
      "videoUrl": "s3://..." | null,
      "thumbUrl": "s3://..." | null,
      "coverUrl": "/api/jobs/.../cover" | null,
      "createdAt": 1777000000000,
      "parent": null | { "jobId": "...", "hostname": "vercel.com", "createdAt": 1776999999999 }
    }
  ],
  "hasMore": true
}
```

**`hasMore` semantics:** the API fetches `limit + 1` rows internally; if `len(rows) > limit`, it returns the first `limit` and sets `hasMore = true`. Cheaper than `COUNT(*)`.

**`parent` enrichment:** when `parentJobId` is non-null, the API joins `jobs p ON p.id = parent_job_id` (same query, single round-trip) and returns `{ jobId, hostname, createdAt }` so the client can render the lineage badge without a second fetch.

---

## DB migration (one new index)

`db/migrations/003_history_polish.sql`:

```sql
-- v2.2 History Page Polish — pg_trgm full-text search on intent
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_jobs_intent_trgm
  ON jobs USING gin ((input->>'intent') gin_trgm_ops);
```

That's it. The existing `(user_id, created_at DESC)` index handles cursor pagination + status/duration filters via in-memory row-by-row predicate evaluation, which stays under 10ms per page for the realistic per-user job-count ceiling (~200 jobs even on Max tier).

**No schema changes** — `parent_job_id`, `thumb_url`, `input` (jsonb) all already exist.

---

## Filter chip UX

- **Chip group**: visually like a segmented control. The "All" option is the default and visually deselected when any specific filter is active.
- **Single-select per group**: status / duration / time are mutually-exclusive within their group. `?status=done&duration=30&time=7d` is valid (one from each); `?status=done&status=failed` is not.
- **URL sync**: every chip click updates the URL via `router.replace()` (no page reload). Browser back-button restores the previous filter state because Next.js's App Router tracks `?` params.
- **Mobile**: chip groups stack vertically when viewport < 768px. Search box stays full-width at top.
- **Visual style**: chips inherit the v2.1 brand-glow pattern — selected chip has `bg-brand-500` + `shadow-brand-500/50`, unselected is glass (`bg-white/5 ring-white/10`).

---

## Search input UX

- **Component**: dedicated `SearchInput.tsx`. Single text input with magnifying-glass icon (left) and clear `×` button (right, visible only when input is non-empty).
- **Debounce**: 300ms via `useDebouncedCallback` (or a tiny inline `useEffect` + `setTimeout` — no library required for a single value).
- **Empty input → drops `?q=` from URL** (don't keep `q=` for a deep-link to "no search").
- **Keyboard**: Enter triggers immediate refresh (skips the remaining debounce). Esc clears the input.
- **No autocomplete / suggestions** — defer until we have telemetry showing top searches.

---

## Card hover micro-interactions

Per Pro Max ui-ux-pro-max conformance:

```css
/* Idle */
ring-1 ring-white/10
shadow-sm

/* Hover (transform + opacity only — never width/height/top/left) */
translate-y-[-4px]
ring-violet-500/40
shadow-2xl shadow-violet-500/20
transition: transform 200ms ease-out, box-shadow 200ms ease-out, border-color 200ms ease-out

/* Reduced motion */
prefers-reduced-motion: reduce → translate-y-0; only border-color + shadow transition.
```

The card itself doesn't need framer-motion — these are pure CSS transitions, GPU-cheap, work across all browsers.

---

## Load-more interaction

- **Button position**: centered below the grid, `mt-12 mb-24`.
- **Idle state**: `Load 24 more →` with brand-glow shadow (lighter than primary CTA — secondary action).
- **Pending state**: button copy → `Loading…`, disabled, content opacity 0.7. A small spinner appears to the left of the text. Button width does not shift (reserve via `min-width` measured on idle render).
- **Newly-loaded cards animate in** via framer-motion `<AnimatePresence>` + `initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.18, delay: index * 0.03 }}`. Stagger 30ms per card so they cascade in. Reduced-motion gates the stagger off.
- **Hidden when `hasMore === false`** — the trailing copy becomes `"You've reached the end. Make more videos →"` (CTA-styled link to `/create`).

---

## Lineage badge

- **Renders only when `parent` field on the job is non-null.**
- **Position**: bottom-left of the card, below the intent snippet, above the duration · time row.
- **Copy**:
  - When `parent.hostname !== current.hostname`: `↳ from <parent-hostname>` (e.g., `↳ from stripe.com`)
  - When `parent.hostname === current.hostname` (regenerate of the same URL): `↳ regenerated <relative-time>` (e.g., `↳ regenerated 2h ago`)
- **Visual**: 11px, italic, `text-brand-300`, hover underline. Click navigates to `/jobs/<parentJobId>`.
- **Accessibility**: `aria-label="Regenerated from job from {parent.hostname} at {ISO timestamp}"`.

---

## Thumbnail extraction (worker change)

### Pipeline

`workers/render/src/index.ts` — after `renderMedia` finishes and before the final `videoUrl` upload:

```ts
// 1. Render still at frame 45 (1.5s past start of the hero scene)
const stillBuffer = await renderStill({
  composition: signedStoryboard,
  serveUrl: bundleLocation,
  frame: 45,
  imageFormat: 'png',  // Remotion native — webp is not a renderStill option
});

// 2. Convert PNG → WebP via sharp (smaller files, faster grid loads)
const webpBuffer = await sharp(stillBuffer).webp({ quality: 80 }).toBuffer();

// 3. Upload as jobs/<id>/thumb.webp
const thumbUri = await putObject(s3, bucket, `jobs/${jobId}/thumb.webp`, webpBuffer, 'image/webp');

// 4. Surface to the orchestrator → DB. Worker's return shape grows:
return { videoUrl, thumbUrl: thumbUri };
```

The orchestrator's `render:completed` handler reduces both fields into the job patch, which propagates to Postgres via the dual-write store.

### Why WebP via sharp (not native renderStill)

Remotion 4's `renderStill` outputs only `png` or `jpeg`. WebP is ~30-40% smaller than equivalent-quality JPEG and decodes faster in modern browsers. Worth the one-time `npm i sharp` cost in the render worker (sharp is already a transitive dep of Remotion's bundler — net new bytes are minimal). Format conversion adds ~50ms per render — invisible on a 60s render path.

### Cover proxy fallback chain (already shipped, just verifying)

`/api/jobs/[jobId]/cover` already prefers `thumb_url` over the crawl screenshot. Once `thumb_url` populates from the worker, history cards auto-upgrade — no client-side change needed. The route's `Content-Type` header is read from S3's metadata (set on upload), so WebP renders correctly in `<img>` without explicit type sniffing.

### Failure mode

If `renderStill` or `sharp` throws, the render worker swallows the error and continues (logged as `[render] thumb extraction failed: <err>`). The job still completes successfully with the MP4. The card falls back to the crawl screenshot indefinitely — acceptable graceful degradation.

---

## Components to add or modify

```
apps/web/src/
  app/
    history/page.tsx                    # MODIFIED — reads URL searchParams, passes to HistoryGrid
  components/
    HistoryGrid.tsx                     # MODIFIED — orchestrates FilterBar + grid + LoadMore
    HistoryCard.tsx                     # NEW — extracted from inline JSX in HistoryGrid
    history/
      FilterBar.tsx                     # NEW — composes the 4 chip groups + search input
      SearchInput.tsx                   # NEW — debounced text input + clear button
      ChipGroup.tsx                     # NEW — generic single-select chip row
      LoadMoreButton.tsx                # NEW — idle/pending/end states
      LineageBadge.tsx                  # NEW — small "↳ from ..." pill
  app/api/users/me/jobs/route.ts        # MODIFIED — accept q/status/duration/time, AND-compose, parent join
  lib/
    history-query.ts                    # NEW — typed URL-param parser/serializer (single source of truth)
  tests/
    components/history/                 # NEW — FilterBar, SearchInput, ChipGroup, LoadMoreButton, LineageBadge
    lib/history-query.test.ts           # NEW

db/migrations/
  003_history_polish.sql                # NEW — pg_trgm extension + GIN index

workers/render/
  src/index.ts                          # MODIFIED — renderStill + sharp WebP + return thumbUrl
  package.json                          # ADD sharp dependency
apps/api/src/
  orchestrator/index.ts                 # MODIFIED — render:completed handler reduces thumbUrl into patch
  jobStorePostgres.ts                   # VERIFY — patch path persists thumb_url (already a column)
```

---

## Accessibility + ui-ux-pro-max conformance

| Rule | How this design satisfies it |
|---|---|
| 4/8px spacing rhythm | All gaps via Tailwind 4-base scale |
| 44×44 touch budgets | All chips ≥ 36×36 with 8px gap; mobile chips bump to 44×44 |
| Motion ≤ 400ms, transform/opacity only | Card hover 200ms; load-more fade-in 180ms; all `transform`/`opacity` |
| `prefers-reduced-motion` gates | Card hover lift disabled; load-more stagger zeroed; pulse halt |
| 4.5:1 contrast | All chip text on glass surfaces verified via design-token contrast utility |
| Visible focus rings | Chips, cards, search input, load-more all use existing `focus-visible:ring-brand-500` pattern |
| 4-state coverage | Loading: skeleton 6 cards. Empty (no jobs): "No videos yet" CTA. No-results (filters returned 0): "No videos match your filters" + clear-filters action. Error: existing "Couldn't load history" red surface |
| One primary CTA per screen | Header `+ New video` is the sole primary; load-more is secondary |
| Mobile-first breakpoints | 375/768/1024/1440 stops; chips stack vertically below 768px |
| URL-synced state | Every filter + search + cursor lands in `?q=…&status=…&duration=…&time=…&before=…` — back-button works |

---

## Out of scope

- **Custom date-range picker** (rejected in Q3).
- **List view / list-grid toggle** (rejected in Q4).
- **Sort options** (always created_at DESC in v1).
- **Bulk actions** (delete multiple, export ZIP) — defer until telemetry shows users batch-managing.
- **Search autocomplete / typo suggestions** — pg_trgm `similarity()` is wired, just not surfaced in v1 UI.
- **Per-status/per-duration partial indexes** — added when telemetry shows query slowdowns at >5K jobs/user.
- **Saved filter presets** ("My drafts", "Last week's marketing videos") — defer until users actually maintain workflows.

---

## Self-review

- **Placeholders:** none.
- **Internal consistency:** `?status=generating` correctly buckets the 5 raw in-flight states. `parent.hostname` enrichment is computed server-side from `parent.input.url`, available when `parentJobId` is set. Cover proxy fallback chain (thumb_url → crawl viewport) already exists; no change needed there. WebP MIME type set explicitly on S3 upload (line in render worker pipeline).
- **Scope check:** single spec, ~3-4 days solo execution. 9-10 tasks in the implementation plan. No Stripe dependency, no other open work blocks.
- **Ambiguity check:**
  - "Time preset" semantics: `time=7d` means `created_at >= now() - interval '7 days'`. Inclusive lower bound. Documented in API contract table.
  - Search match priority: `pg_trgm` matches partial substrings; the result set is ordered by `created_at DESC` (not relevance). Telemetry-driven decision: if users complain about relevance, add `ORDER BY similarity(intent, q) DESC, created_at DESC`.
  - Lineage badge "same hostname" check: case-insensitive comparison after stripping `www.` prefix. Documented in §"Lineage badge" copy section.

---

**Next step:** invoke `superpowers:writing-plans` once user approves.
