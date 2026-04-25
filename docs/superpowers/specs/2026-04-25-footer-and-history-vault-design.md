# Professional Footer + User History Vault — Design Spec

## Module 1: Professional Footer

### Goal
Replace the existing 3-column stub footer with a proper 4-column marketing footer and provide Coming Soon stub pages for all unbuilt links.

### Component: `LandingFooter.tsx`

Four link columns:

| Company | Product | Support | Legal |
|---|---|---|---|
| About → `/about` | Features → `/features` | Documentation → `/docs` | Privacy Policy → `/privacy` |
| Blog → `/blog` | API Docs → `/api-docs` | Help Center → `/help` | Terms of Service → `/terms` |
| Careers → `/careers` | Pricing → `/billing` | Contact → `mailto:hi@lumespec.dev` | Security → `/security` |
| | History → `/history` | | |

Bottom bar: LumeSpec logo text + "© 2026 LumeSpec Inc." + three SVG social icons (Twitter/X, GitHub, Discord).

Visual: `bg-[#0a0a0a] border-t border-white/10`. Grid collapses to 2 columns on mobile, 4 on desktop.

### Component: `ComingSoonPage`

Single shared RSC at `apps/web/src/components/ComingSoonPage.tsx`. Props: `{ name: string }`.
- `#0a0a0a` background
- Centered content: pill badge "Coming Soon" + heading + subtitle + back-to-home link
- Brand gradient on heading text

Stub routes that use it: `/about`, `/blog`, `/careers`, `/features`, `/api-docs`, `/docs`, `/help`, `/privacy`, `/terms`, `/security`.

---

## Module 2: User History Vault

### Goal
Upgrade the History page with inline asset download (MP4 + Storyboard JSON), one-click Fork & Edit, and a Free-tier watermark upgrade prompt — all on the card without navigating to the job detail page.

### Architecture

Three independent changes:

1. **Download API** — new `GET /api/jobs/[jobId]/download?type=mp4|storyboard` route. Verifies session + ownership via DB, generates a 15-minute S3 presigned URL, returns 307 redirect. Browser follows the redirect and downloads the file directly from S3.

2. **Tier injection** — `GET /api/users/me/jobs` gains a top-level `tier: 'free' | 'pro' | 'max'` field derived from a single `getUserTier` SQL query (`COALESCE` on `subscriptions.tier`). `HistoryGrid` passes `tier` down to each `HistoryCard`.

3. **HistoryCard restructure** — outer container changes from `<Link>` to `<div>`. The thumbnail/info block becomes an inner `<Link>`. Below it: an action row (Download MP4, Download JSON, Fork) visible only when `status === 'done'`. A watermark upgrade hint strip visible when `status === 'done'` AND `tier === 'free'`.

4. **Fork & Edit** — `create/page.tsx` reads `?forkId` from searchParams, queries DB for the parent job (with ownership check), and passes `{ parentJobId, url, intent, duration, hint? }` to `CreatePageBody`. The form is prefilled but NOT auto-submitted. `JobForm` already accepts `parentJobId` + all initial-value props — no changes needed there.

### Download route details

S3 URI format: `s3://bucket/path/to/key`. Parse with regex `^s3://([^/]+)/(.+)$`.

`type=mp4`: query `video_url` from DB. Generate presigned URL with `ResponseContentDisposition: attachment; filename="lumespec-${jobId}.mp4"`.

`type=storyboard`: query `storyboard_uri` from DB. Generate presigned URL with `ResponseContentDisposition: attachment; filename="storyboard-${jobId}.json"`.

Return 404 if the file URI is null (job not yet done).

### Watermark upgrade hint

Rendered as a bottom strip on the card: amber/yellow tint, "⚡ Upgrade to Pro to remove the watermark" with a link to `/billing`. Shown only when `tier === 'free'` AND `job.status === 'done'`.

### Fork & Edit flow

`create/page.tsx` server component:
1. `const forkId = searchParams.forkId`
2. If `forkId` + auth enabled: query DB `SELECT id, input, user_id FROM jobs WHERE id = $1 AND user_id = $2`
3. If found: extract `{ url, intent, duration, hint? }` from `job.input` + set `parentJobId = forkId`
4. Pass as `fork` prop to `CreatePageBody`

`CreatePageBody` fork path: renders `JobForm` with all initial props + `parentJobId`. No auto-submit effect runs for `fork` (only for `prefill`).
