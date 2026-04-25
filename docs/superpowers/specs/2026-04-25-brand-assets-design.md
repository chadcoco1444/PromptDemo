# Brand Assets Upgrade Design

## Goal

Replace the Vercel-default landing video and broken README hero image with
PromptDemo-branded assets that showcase the actual product. Update the dogfood
script to support generating a watermarked video for PLG marketing.

## Architecture

Web-only changes + one API model addition. The `--watermark` flag on the
dogfood script injects `forceWatermark: true` into the POST payload; the API
stores this in the job `input` and both `postJob.ts` and the orchestrator read
it to override the tier-based `showWatermark` derivation.

**Tech Stack:** Node.js ESM script, Zod schema extension, Fastify route, README
Markdown.

---

## Changes

### 1. `forceWatermark` API field

**File:** `apps/api/src/model/job.ts`

Add `forceWatermark: z.boolean().optional()` to `JobInputSchema`. Stored in
`job.input` so the orchestrator can read it when the crawl completes.

**File:** `apps/api/src/routes/postJob.ts`

After all tier checks (line ~174), before `newJob` construction:
```ts
if (input.forceWatermark) showWatermark = true;
```

**File:** `apps/api/src/orchestrator/index.ts`

After the `getUserTier` block (line ~92), before enqueuing to storyboard:
```ts
if (current.input.forceWatermark) showWatermark = true;
```

Security note: `forceWatermark` can only *add* the watermark, never remove it.
Regular users already get the watermark enforced server-side; this field lets
trusted scripts opt-in for Pro accounts.

### 2. Dogfood script `--watermark` flag

**File:** `scripts/dogfood-landing-demo.mjs`

- Parse `--watermark` anywhere in `process.argv`
- Change default URL to `https://stripe.com`
- Change default intent to PromptDemo-specific marketing copy
- Change default duration to `30`
- When flag set: include `forceWatermark: true` in POST body
- Output path: `docs/readme/landing-hero-demo.mp4`

### 3. README.md redesign (AIDA framework)

**File:** `README.md`

Structure:
1. **Attention** — centered hero, gradient title, badge row, demo GIF with
   Pill Badge visible, 100-word punch paragraph
2. **Interest** — "Why PromptDemo?" 3-card benefits grid (Creativity Engine /
   Pixel-Perfect / History Vault), benefits language not feature language
3. **Desire** — "How It Works" 5-step horizontal flow + 3-command Quickstart +
   tech stack table
4. **Action** — Roadmap 4-item grid + Contributing + ⭐ Star CTA

## Storyboard for demo.gif (15–20s)

| Time | Scene | Visual |
|------|-------|--------|
| 0–3s | Input | URL input field, type `https://stripe.com`, type intent |
| 3–7s | Crawl | Terminal-style log: Crawling… Industry: fintech → JSON flash |
| 7–12s | Render | Scene cards flipping: HeroStylized → BentoGrid → CTA |
| 12–17s | Output | Generated video playing, Pill Badge visible bottom-right |
| 17–20s | History | History Vault UI, Download + Fork buttons highlighted |

## Files

| Action | Path |
|--------|------|
| Modify | `apps/api/src/model/job.ts` |
| Modify | `apps/api/src/routes/postJob.ts` |
| Modify | `apps/api/src/orchestrator/index.ts` |
| Modify | `scripts/dogfood-landing-demo.mjs` |
| Modify | `README.md` |
