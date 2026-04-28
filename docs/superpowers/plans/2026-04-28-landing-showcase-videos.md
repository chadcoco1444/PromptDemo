# Landing IntentVideoShowcase v1.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-card video showcase to the landing page that demonstrates the core "same URL, 3 intents → 3 different videos" value prop, using real Vercel × {hardsell, tech, emotional} renders.

**Architecture:** A standalone Vite section (`IntentVideoShowcase`) inserted between `Hero` and `IntentMatrix` in `apps/landing/src/App.tsx`. Three pre-rendered Vercel MP4s sit in `apps/landing/public/showcase/`, served as static assets via the `/LumeSpec/` GitHub Pages base. `IntersectionObserver` lazy-triggers playback when a card enters viewport (threshold 0.5), pauses when it leaves. `preload="metadata"` keeps initial page weight low (~50KB headers vs ~9MB MP4 sum).

**Tech Stack:** Vite 5 + React 18 + Tailwind 3, IntersectionObserver (native browser API), existing render worker (Anthropic-backed) for one-off pre-render via helper script.

**Out of scope (deferred):**
- Other URL rows (duolingo / gopro showcases) — v1.6 if Vercel row converts
- Custom video controls, fullscreen, captions
- Poster images / thumbnails (preload=metadata is enough)
- Adaptive quality / multiple bitrates
- Render automation in CI (this is a one-off helper script)

---

## File Structure

**Create:**
- `scripts/render-showcase-videos.mjs` — one-off helper, submits 3 jobs sequentially, polls until done, downloads MP4 to `apps/landing/public/showcase/vercel-{intent}.mp4`. Mirrors auth + env loading from `scripts/intent-spectrum-eval.mjs`.
- `apps/landing/public/showcase/vercel-hardsell.mp4` — render output (T1)
- `apps/landing/public/showcase/vercel-tech.mp4` — render output (T1)
- `apps/landing/public/showcase/vercel-emotional.mp4` — render output (T1)
- `apps/landing/src/data/intentVideos.ts` — typed metadata for the 3 cards (filename, label, headline, description, emoji)
- `apps/landing/src/components/IntentVideoShowcase.tsx` — 3-card grid + per-card `VideoCard` with IntersectionObserver autoplay/pause logic

**Modify:**
- `apps/landing/src/App.tsx` — insert `<IntentVideoShowcase />` between `<Hero />` and `<IntentMatrix />`

**Test:** No new vitest specs (the existing landing app has no test runner; React tree is small + visually verified). The helper script self-verifies via job poll loop. Visual + manual smoke is sufficient gating.

---

## Task 1: Render 3 Vercel showcase videos

**Files:**
- Create: `scripts/render-showcase-videos.mjs`
- Output: `apps/landing/public/showcase/vercel-hardsell.mp4`
- Output: `apps/landing/public/showcase/vercel-tech.mp4`
- Output: `apps/landing/public/showcase/vercel-emotional.mp4`

**Pre-conditions (operator must verify before dispatch):**
- All services running: `pnpm lume status` shows web + api + workers green
- Anthropic credit balance > $1.50 (each storyboard ~$0.10–0.18, 3 jobs)
- `.env` has `INTERNAL_API_SECRET` set
- `.env` has `DOGFOOD_USER_ID` set to a **real user_id with initialized credits**, NOT the script's fallback default of `'1'`. Verify with: `docker exec -i lumespec-postgres-1 psql -U lumespec -d lumespec -c "SELECT user_id, balance FROM credits WHERE user_id = $DOGFOOD_USER_ID;"` — if zero rows, the API returns `500 user_credits_not_initialized` and the script crashes on first POST. (For chadcoco1444's local: `DOGFOOD_USER_ID=28`.)
- MinIO reachable at `S3_ENDPOINT` (default `http://localhost:9000`)

- [ ] **Step 1: Create helper script skeleton**

Mirror auth + env loading from `scripts/intent-spectrum-eval.mjs:18-100`. Use `mintJwt(userId)` with the same HS256 logic.

```js
#!/usr/bin/env node
/**
 * One-off helper: render 3 Vercel videos with different intents,
 * download the MP4 outputs into apps/landing/public/showcase/.
 *
 * Usage:  node scripts/render-showcase-videos.mjs
 *
 * Wall time: ~10-15 min (render worker concurrency=1, 3 jobs serial).
 * Cost: ~$0.30-0.50 for 3 Claude Sonnet storyboard calls.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, createWriteStream } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..');

function loadDotenv() {
  const path = resolve(REPO_ROOT, '.env');
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}
loadDotenv();

const apiBase = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';
const userId = process.env.DOGFOOD_USER_ID ?? '1';
const secret = process.env.INTERNAL_API_SECRET;
const minioBase = process.env.S3_ENDPOINT ?? 'http://localhost:9000';

if (!secret) {
  console.error('INTERNAL_API_SECRET not set — load .env first');
  process.exit(1);
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function mintJwt(sub, ttlSec = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { sub: String(sub), iat: now, exp: now + ttlSec, iss: 'lumespec-web', aud: 'lumespec-api' };
  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest();
  return `${signingInput}.${b64url(sig)}`;
}
const token = mintJwt(userId);
const auth = { Authorization: `Bearer ${token}` };
```

- [ ] **Step 2: Define the 3 jobs + sequential render loop**

Define the same 3 intents as `intent-spectrum-eval.mjs:66-82` (copy verbatim — single source of truth in spirit, separate copy here is OK because this is a throwaway helper). URL is hardcoded to `https://vercel.com`.

```js
const URL_TARGET = 'https://vercel.com';
const INTENTS = [
  { id: 'hardsell',  text: 'High-energy promotional spot. Short punchy scene durations. Emphasize speed, results, and aesthetic. Use a single powerful tagline. Tone: energetic, modern.' },
  { id: 'tech',      text: 'Calm, methodical product walkthrough for technical buyers. Show concrete features and capabilities in sequence. Highlight what the product actually does, not why it matters emotionally. Tone: confident, precise, no marketing fluff.' },
  { id: 'emotional', text: 'A romantic, atmospheric brand story. Slow scene pacing. Emphasize aspiration, lifestyle, who-you-become rather than what-the-product-does. Tone: cinematic, evocative, human.' },
];

const OUT_DIR = resolve(REPO_ROOT, 'apps/landing/public/showcase');
mkdirSync(OUT_DIR, { recursive: true });

async function submitJob(intent) {
  const res = await fetch(`${apiBase}/api/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...auth },
    body: JSON.stringify({ url: URL_TARGET, intent: intent.text, duration: 30 }),
  });
  if (!res.ok) throw new Error(`POST failed for ${intent.id}: ${res.status} ${await res.text()}`);
  const { jobId } = await res.json();
  console.log(`  submitted ${intent.id} → ${jobId}`);
  return jobId;
}

async function pollUntilRendered(jobId, intentId) {
  const start = Date.now();
  let lastStage = null;
  while (true) {
    if (Date.now() - start > 12 * 60_000) throw new Error(`timeout for ${intentId} (${jobId})`);
    const r = await fetch(`${apiBase}/api/jobs/${jobId}`, { headers: auth });
    if (!r.ok) throw new Error(`GET ${jobId} failed: ${r.status}`);
    const job = await r.json();
    if (job.stage !== lastStage) {
      console.log(`  [${intentId}] stage=${job.stage} status=${job.status}`);
      lastStage = job.stage;
    }
    if (job.status === 'failed') throw new Error(`job ${jobId} failed: ${JSON.stringify(job.error)}`);
    if (job.status === 'done' && job.videoUrl) return job.videoUrl;
    await new Promise((res) => setTimeout(res, 4_000));
  }
}

async function downloadMp4(s3Uri, intentId) {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(s3Uri);
  if (!m) throw new Error(`bad S3 URI: ${s3Uri}`);
  const [, bucket, key] = m;
  const res = await fetch(`${minioBase}/${bucket}/${key}`);
  if (!res.ok) throw new Error(`MinIO GET failed: ${res.status}`);
  const dest = resolve(OUT_DIR, `vercel-${intentId}.mp4`);
  await pipeline(res.body, createWriteStream(dest));
  const sizeMb = (Number(res.headers.get('content-length') ?? 0) / 1024 / 1024).toFixed(2);
  console.log(`  ✓ saved ${dest} (${sizeMb} MB)`);
  return dest;
}

console.log(`[render] minting JWT, target=${apiBase}, output=${OUT_DIR}`);
for (const intent of INTENTS) {
  console.log(`\n=== ${intent.id} ===`);
  const jobId = await submitJob(intent);
  const outputUri = await pollUntilRendered(jobId, intent.id);
  await downloadMp4(outputUri, intent.id);
}
console.log(`\n[render] all 3 videos saved to ${OUT_DIR}`);
```

- [ ] **Step 3: Operator runs the script**

Run: `node scripts/render-showcase-videos.mjs`
Expected: 3 stage transition logs per intent, 3 MP4s saved at end. Wall time ~10–15 min.

If a job fails mid-loop (network blip / Anthropic credit / circuit), re-run; the sequential loop will resubmit all 3 (a smarter resume-from-N is YAGNI for a helper).

- [ ] **Step 4: Verify outputs exist and are non-trivial**

Run:
```bash
ls -lh apps/landing/public/showcase/
file apps/landing/public/showcase/vercel-*.mp4
```
Expected: 3 files, each ~2–4 MB, all reported as `ISO Media, MP4 v2`.

- [ ] **Step 5: Commit script + outputs**

```bash
git add scripts/render-showcase-videos.mjs apps/landing/public/showcase/
git commit -m "feat(landing): render 3 Vercel showcase videos for IntentVideoShowcase"
```

**Note:** Touching `apps/landing/public/**` does NOT trigger DESIGN.md sync hook (not in the path map in CLAUDE.md). Helper scripts under `scripts/` likewise. No `--no-verify` needed.

---

## Task 2: IntentVideoShowcase component + wiring

**Files:**
- Create: `apps/landing/src/data/intentVideos.ts`
- Create: `apps/landing/src/components/IntentVideoShowcase.tsx`
- Modify: `apps/landing/src/App.tsx`

- [ ] **Step 1: Create the data module**

```ts
// apps/landing/src/data/intentVideos.ts
export interface IntentVideo {
  intent: 'hardsell' | 'tech' | 'emotional';
  filename: string;
  emoji: string;
  label: string;
  headline: string;
  description: string;
}

// One URL (Vercel), three intents — demonstrates the core value prop
// that intent steers the entire storyboard, not just the copy.
export const INTENT_VIDEOS: IntentVideo[] = [
  {
    intent: 'hardsell',
    filename: 'vercel-hardsell.mp4',
    emoji: '🔥',
    label: 'Hard-sell',
    headline: 'Punchy promo cuts',
    description: 'Fast scene pace, single tagline, energetic tone.',
  },
  {
    intent: 'tech',
    filename: 'vercel-tech.mp4',
    emoji: '🔬',
    label: 'Tech deep-dive',
    headline: 'Methodical walkthrough',
    description: 'Concrete features in sequence, no marketing fluff.',
  },
  {
    intent: 'emotional',
    filename: 'vercel-emotional.mp4',
    emoji: '💫',
    label: 'Emotional brand story',
    headline: 'Cinematic atmosphere',
    description: 'Slow pace, aspiration, who-you-become framing.',
  },
];
```

- [ ] **Step 2: Create the showcase component**

```tsx
// apps/landing/src/components/IntentVideoShowcase.tsx
import { useEffect, useRef, useState } from 'react';
import { INTENT_VIDEOS, type IntentVideo } from '../data/intentVideos';

function VideoCard({ video }: { video: IntentVideo }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [shouldPlay, setShouldPlay] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setShouldPlay(entry.isIntersecting);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (shouldPlay) el.play().catch(() => {});
    else el.pause();
  }, [shouldPlay]);

  return (
    <article className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900 hover:border-purple-500 transition">
      <div className="aspect-video bg-black">
        <video
          ref={ref}
          src={`${import.meta.env.BASE_URL}showcase/${video.filename}`}
          muted
          loop
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-6">
        <div className="text-sm uppercase tracking-wide text-gray-400 flex items-center gap-2">
          <span>{video.emoji}</span>
          <span>{video.label}</span>
        </div>
        <div className="mt-2 text-xl font-bold">{video.headline}</div>
        <p className="mt-2 text-sm text-gray-400">{video.description}</p>
      </div>
    </article>
  );
}

export function IntentVideoShowcase() {
  return (
    <section className="py-16 px-6 max-w-6xl mx-auto">
      <header className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-bold">Same URL. Three intents. Three videos.</h2>
        <p className="mt-3 text-gray-400">
          We crawled <code className="text-purple-400">vercel.com</code> once, then steered the storyboard
          AI three different ways. Scroll each card — it autoplays in view.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {INTENT_VIDEOS.map((v) => (
          <VideoCard key={v.intent} video={v} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire into App.tsx**

Modify `apps/landing/src/App.tsx`:

```tsx
import { Hero } from './components/Hero';
import { IntentVideoShowcase } from './components/IntentVideoShowcase';
import { IntentMatrix } from './components/IntentMatrix';
import { TallyEmbed } from './components/TallyEmbed';
import { Footer } from './components/Footer';

export function App() {
  return (
    <main>
      <Hero />
      <IntentVideoShowcase />
      <IntentMatrix />
      <TallyEmbed />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm --filter @lumespec/landing typecheck` (or `pnpm typecheck` for the workspace)
Expected: 0 errors. The `import.meta.env.BASE_URL` is typed via `vite/client` (already in `apps/landing/tsconfig.json`).

- [ ] **Step 5: Local visual smoke**

Run: `pnpm --filter @lumespec/landing dev`
Open the dev URL. Expected:
- Hero renders → new "Same URL. Three intents." section appears below
- All 3 video cards visible at md+ widths (3-col), stacked at mobile
- Scrolling each card into view triggers autoplay (no audio); scrolling away pauses
- Initial network tab shows only metadata range requests, full MP4 fetch starts when card crosses viewport

If any video 404s: confirm files at `apps/landing/public/showcase/` from T1 and that the `BASE_URL` resolves to `/LumeSpec/` in dev (Vite respects the `base` config).

- [ ] **Step 6: Commit**

```bash
git add apps/landing/src/data/intentVideos.ts \
        apps/landing/src/components/IntentVideoShowcase.tsx \
        apps/landing/src/App.tsx
git commit -m "feat(landing): add IntentVideoShowcase with autoplay-on-scroll"
```

- [ ] **Step 7: Push and verify deploy**

```bash
git push origin main
```

Expected: `.github/workflows/deploy-landing.yml` re-triggers on `apps/landing/**` change. Wall time ~2–3 min.

Verify live:
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://chadcoco1444.github.io/LumeSpec/showcase/vercel-hardsell.mp4
```
Expected: `200`.

Open `https://chadcoco1444.github.io/LumeSpec/` and confirm the new section renders + plays under viewport scroll.

---

## Self-Review Checklist

- **Spec coverage:** Both tasks together produce: 3 rendered MP4s + 3-card showcase between Hero and IntentMatrix with lazy-load autoplay-on-scroll behavior. ✓
- **Placeholder scan:** No "TODO / TBD / similar to". All code blocks are complete and copy-pasteable. ✓
- **Type consistency:** `IntentVideo['filename']` matches `vercel-{intent}.mp4` pattern produced by T1. `intent` enum matches the 3 IDs used in the helper script. ✓
- **DESIGN.md sync:** No paths in T1/T2 trigger the pre-commit hook (`apps/landing/**` and `scripts/**` are not in the sync map). No DESIGN.md edit needed.
- **Bundle impact:** ~3 small TSX additions (~2KB gzip), no new deps. Videos served as static public assets, not bundled.
- **Resilience:** T1 sequential loop tolerates one-off failures via re-run. T2 IntersectionObserver gracefully no-ops on unsupported browsers (very old Safari) — videos just stay paused, still visible.

---

## Execution Handoff

**Recommended:** Subagent-Driven Development.
- T1 dispatched first (contains real Anthropic spend + ~10–15 min wait); operator must confirm credit + services live before dispatch.
- T2 dispatched after T1 commits land; pure code change.
- Two-stage review per task (spec compliance → code quality).

**Cost gate:** Total ~$0.30–0.50 Anthropic + 10–15 min wall + 2 commits.

**Stop conditions:**
- T1: any job hits `STORYBOARD_GEN_FAILED` more than once → halt + report (likely Vercel content-shape regression, not script bug).
- T2: typecheck fails → fix inline, do not bypass.
