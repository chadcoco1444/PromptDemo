# Landing Page on GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public-facing static landing page on GitHub Pages with autoplay demo video, intent-matrix showcase, Tally waitlist form, and zero backend.

**Architecture:** New `apps/landing/` Vite + React + Tailwind static site (separate from Next.js `apps/web/` to avoid SSR/NextAuth coupling). 6 components, ~600 LOC total. GitHub Actions deploys to `chadcoco1444.github.io/LumeSpec/` (D1 subpath); D2 custom-domain swap is a 5-line follow-up post-launch.

**Tech Stack:** Vite 5, React 18, Tailwind 3, TypeScript 5.5, GitHub Actions Pages deployment.

---

## Spec Coverage Map

This plan implements `docs/superpowers/specs/2026-04-28-landing-github-pages-design.md`. Each Component Spec maps to one task:

| Spec section | Task |
|---|---|
| Component Spec 1 (vite.config.ts) | T2 |
| Component Spec 2 (Hero.tsx) | T3 |
| Component Spec 3 (IntentMatrix.tsx + data) | T4 |
| Component Spec 4 (TallyEmbed.tsx) | T5 |
| Component Spec 5 (deploy-landing.yml) | T6 |

Workspace + project bootstrap split across T1 (package + tsconfig) and T2 (Vite + Tailwind + skeleton React) for shippable granularity.

**Shippable per task:** T1 = workspace recognises new package. T2 = local dev server runs. T3 = visible hero. T4 = full showcase. T5 = waitlist + footer. T6 = live on GitHub Pages.

---

## File Structure (locked from spec, transcribed for reference)

| File | Status | Owner Task |
|---|---|---|
| `apps/landing/package.json` | Create | T1 |
| `apps/landing/tsconfig.json` | Create | T1 |
| `apps/landing/vite.config.ts` | Create | T2 |
| `apps/landing/tailwind.config.cjs` | Create | T2 |
| `apps/landing/postcss.config.cjs` | Create | T2 |
| `apps/landing/index.html` | Create | T2 |
| `apps/landing/src/main.tsx` | Create | T2 |
| `apps/landing/src/App.tsx` | Create (skeleton T2, fill in T3-T5) | T2/T3/T4/T5 |
| `apps/landing/src/styles/tailwind.css` | Create | T2 |
| `apps/landing/public/demo-30s.mp4` | Create (copy from docs/readme/) | T3 |
| `apps/landing/public/favicon.ico` | Create (copy from apps/web/public/) | T2 |
| `apps/landing/src/components/Hero.tsx` | Create | T3 |
| `apps/landing/src/data/intentMatrix.ts` | Create | T4 |
| `apps/landing/src/components/IntentMatrix.tsx` | Create | T4 |
| `apps/landing/src/components/TallyEmbed.tsx` | Create | T5 |
| `apps/landing/src/components/Footer.tsx` | Create | T5 |
| `.github/workflows/deploy-landing.yml` | Create | T6 |

`pnpm-workspace.yaml` already covers `apps/*` glob — no edit needed.

The DESIGN.md sync hook does NOT trigger for `apps/landing/**` paths or `.github/workflows/deploy-landing.yml` (only specific main-app paths trigger). Plain commits throughout.

---

## Task 1: Workspace + Package Foundation

**Goal:** New `apps/landing` package recognized by pnpm workspace; type-checks empty.

**Files:**
- Create: `apps/landing/package.json`
- Create: `apps/landing/tsconfig.json`

- [ ] **Step 1: Verify workspace glob covers apps/landing**

```bash
cat pnpm-workspace.yaml
```
Expected output includes `'apps/*'` — already covers our new directory. No edit needed.

- [ ] **Step 2: Create `apps/landing/package.json`**

```json
{
  "name": "@lumespec/landing",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview --port 4173",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "@vitejs/plugin-react": "4.3.2",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.47",
    "tailwindcss": "3.4.13",
    "typescript": "5.5.4",
    "vite": "5.4.8"
  }
}
```

- [ ] **Step 3: Create `apps/landing/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Install workspace dependencies**

```bash
pnpm install --filter @lumespec/landing
```
Expected: pnpm fetches all 9 dev/runtime deps + lockfile updated. No error.

- [ ] **Step 5: Verify workspace recognition**

```bash
pnpm --filter @lumespec/landing exec node -e "console.log('ok')"
```
Expected output: `ok`

- [ ] **Step 6: Commit**

The DESIGN.md sync hook does NOT trigger for `apps/landing/**` paths. Plain commit.

```bash
git add apps/landing/package.json apps/landing/tsconfig.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(landing): bootstrap apps/landing workspace package

New static-site package for the public-facing landing page that ships
to GitHub Pages. Separate from apps/web/ Next.js to avoid SSR /
NextAuth coupling — pure Vite + React + Tailwind static build.

Foundation only: package.json + tsconfig. Vite/Tailwind config and
React entry come in T2.

Spec: docs/superpowers/specs/2026-04-28-landing-github-pages-design.md

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Vite + Tailwind + Skeleton React

**Goal:** `pnpm --filter @lumespec/landing dev` opens a working Vite server with Tailwind classes applied; placeholder hero text visible.

**Files:**
- Create: `apps/landing/vite.config.ts`
- Create: `apps/landing/tailwind.config.cjs`
- Create: `apps/landing/postcss.config.cjs`
- Create: `apps/landing/index.html`
- Create: `apps/landing/src/main.tsx`
- Create: `apps/landing/src/App.tsx`
- Create: `apps/landing/src/styles/tailwind.css`
- Create: `apps/landing/public/favicon.ico` (copy from apps/web/public/)

- [ ] **Step 1: Create `apps/landing/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages D1: subpath under chadcoco1444.github.io/LumeSpec/.
  // Change to '/' when D2 custom domain wired (see spec D1→D2 migration).
  base: '/LumeSpec/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
});
```

- [ ] **Step 2: Create `apps/landing/tailwind.config.cjs`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
```

- [ ] **Step 3: Create `apps/landing/postcss.config.cjs`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Create `apps/landing/src/styles/tailwind.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 5: Create `apps/landing/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/x-icon" href="./favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="LumeSpec — AI-directed demo videos. Paste a URL, pick your intent, get a polished 30s demo." />
    <title>LumeSpec — AI-directed demo videos</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `apps/landing/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tailwind.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('root element not found');
createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 7: Create `apps/landing/src/App.tsx` (skeleton)**

```tsx
export function App() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <h1 className="text-4xl font-bold">LumeSpec landing — under construction</h1>
    </main>
  );
}
```

- [ ] **Step 8: Copy favicon**

```bash
mkdir -p apps/landing/public
cp apps/web/public/favicon.ico apps/landing/public/favicon.ico
```

If `apps/web/public/favicon.ico` doesn't exist, use any 32×32 .ico file or skip — the `<link rel="icon">` will silently 404 and that's acceptable for v1.

- [ ] **Step 9: Run dev server**

```bash
pnpm --filter @lumespec/landing dev
```
Expected output: `VITE v5.4.8 ready in <N>ms` + URL like `http://localhost:5173/LumeSpec/`. Open URL in browser, see "LumeSpec landing — under construction" headline on black background, white text. Tailwind classes applied (centered, large bold).

`Ctrl+C` to stop.

- [ ] **Step 10: Run typecheck + build**

```bash
pnpm --filter @lumespec/landing typecheck
pnpm --filter @lumespec/landing build
```
Expected: typecheck clean, build produces `apps/landing/dist/` with `index.html` + hashed JS/CSS bundles. Total dist size < 200 KB at this stage.

- [ ] **Step 11: Commit**

```bash
git add apps/landing/vite.config.ts apps/landing/tailwind.config.cjs apps/landing/postcss.config.cjs apps/landing/index.html apps/landing/src/main.tsx apps/landing/src/App.tsx apps/landing/src/styles/tailwind.css apps/landing/public/favicon.ico
git commit -m "$(cat <<'EOF'
feat(landing): vite + tailwind + skeleton react

Toolchain configured for GitHub Pages D1 (subpath /LumeSpec/).
Dev server runs locally, build produces static dist/.

Skeleton App.tsx shows placeholder headline; T3 fills in Hero, T4
fills in IntentMatrix, T5 fills in TallyEmbed + Footer.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Hero Component + Demo Video Asset

**Goal:** Hero section with autoplay muted demo video, headline copy, dual CTA buttons (Tally anchor + GitHub Star link).

**Files:**
- Create: `apps/landing/public/demo-30s.mp4` (copy from docs/readme/)
- Create: `apps/landing/src/components/Hero.tsx`
- Modify: `apps/landing/src/App.tsx`

- [ ] **Step 1: Copy demo video asset**

```bash
cp docs/readme/demo-30s.mp4 apps/landing/public/demo-30s.mp4
ls -lh apps/landing/public/demo-30s.mp4
```
Expected: file copied, size ~1-3 MB.

NOTE: source path is `docs/readme/demo-30s.mp4` (NOT `apps/web/public/` — the spec listed wrong source path; corrected here).

- [ ] **Step 2: Create `apps/landing/src/components/Hero.tsx`**

```tsx
export function Hero() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6 py-20">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="w-full max-w-4xl rounded-lg shadow-2xl"
        src={`${import.meta.env.BASE_URL}demo-30s.mp4`}
      />
      <h1 className="mt-12 text-5xl md:text-6xl font-bold tracking-tight text-center">
        AI-directed demo videos.<br />
        From any URL. In any voice.
      </h1>
      <p className="mt-6 text-xl text-gray-300 max-w-2xl text-center">
        Paste a URL, pick your intent — get a polished 30s demo video.
        No editing software. No reshoots. No stale assets.
      </p>
      <div className="mt-12 flex flex-col sm:flex-row gap-4">
        <a
          href="#waitlist"
          className="bg-purple-600 hover:bg-purple-700 transition px-8 py-4 rounded-lg font-semibold text-center"
        >
          Get early access →
        </a>
        <a
          href="https://github.com/chadcoco1444/LumeSpec"
          target="_blank"
          rel="noopener noreferrer"
          className="border border-white hover:bg-white hover:text-black transition px-8 py-4 rounded-lg font-semibold text-center"
        >
          ⭐ Star on GitHub
        </a>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire Hero into App.tsx**

Replace the entire contents of `apps/landing/src/App.tsx`:

```tsx
import { Hero } from './components/Hero';

export function App() {
  return (
    <main>
      <Hero />
    </main>
  );
}
```

- [ ] **Step 4: Visual smoke test**

```bash
pnpm --filter @lumespec/landing dev
```
Open `http://localhost:5173/LumeSpec/`. Verify:
- Hero video autoplays muted, loops
- Headline + subhead render with correct typography
- Two CTA buttons visible side-by-side (or stacked on mobile width 375px)
- Click "Star on GitHub" — opens repo in new tab
- Click "Get early access" — scrolls (no target yet, T5 adds the section)

`Ctrl+C` to stop.

- [ ] **Step 5: Build verification**

```bash
pnpm --filter @lumespec/landing build
```
Expected: clean build. Verify `apps/landing/dist/demo-30s.mp4` was copied (Vite handles `public/` → `dist/` automatically).

- [ ] **Step 6: Commit**

```bash
git add apps/landing/public/demo-30s.mp4 apps/landing/src/components/Hero.tsx apps/landing/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(landing): hero section with autoplay demo + dual CTA

- Autoplay muted loop demo-30s.mp4 (copied from docs/readme/)
- Headline + subhead from spec
- Dual CTA per spec sub-decision: Tally form anchor (#waitlist,
  T5 will add the section) + GitHub Star link to repo
- Mobile-responsive: CTAs stack on <sm, side-by-side on >=sm
- ${import.meta.env.BASE_URL}demo-30s.mp4 — Vite base config makes
  D1→D2 transition zero code change here

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Intent Matrix Data + Component

**Goal:** Showcase section displaying 2 URLs × 3 intents = 6 cells of real intent-spectrum-eval data.

**Files:**
- Create: `apps/landing/src/data/intentMatrix.ts`
- Create: `apps/landing/src/components/IntentMatrix.tsx`
- Modify: `apps/landing/src/App.tsx`

- [ ] **Step 1: Read source data from intent-spectrum reports**

The exact scene sequences for vercel + duolingo come from the most recent intent-spectrum eval. Use the latest 9-cell verification:

```bash
ls -t docs/dev-notes/intent-spectrum-2026-04-28-supplement-*.md | head -1
```

Open the file. Find the per-job detail sections for vercel/hardsell, vercel/tech, vercel/emotional, duolingo/hardsell, duolingo/tech, duolingo/emotional. Each section lists `scenes (N): TypeA → TypeB → ...`.

Transcribe these into the data file in Step 2. **Use the actual scene sequences from the file**, not approximations.

- [ ] **Step 2: Create `apps/landing/src/data/intentMatrix.ts`**

```ts
export type Intent = 'hardsell' | 'tech' | 'emotional';

export interface IntentMatrixCell {
  url: string;
  brandName: string;
  intent: Intent;
  intentLabel: string;
  intentEmoji: string;
  sceneSequence: string[];
  sceneCount: number;
  avgPaceSec: number;
  notes: string;
}

// Data sourced from docs/dev-notes/intent-spectrum-2026-04-28-supplement-*.md
// (Day 2 9-cell verification, vercel + duolingo cells = 6/6 real-world success).
// Burton row deferred until Anthropic credit re-tops + remaining 2 cells re-run.
export const INTENT_MATRIX: IntentMatrixCell[] = [
  {
    url: 'https://vercel.com',
    brandName: 'Vercel',
    intent: 'hardsell',
    intentLabel: 'Hard-sell',
    intentEmoji: '🔥',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'TextPunch', 'CursorDemo', 'CodeToUI', 'TextPunch', 'BentoGrid', 'TextPunch', 'CTA'],
    sceneCount: 9,
    avgPaceSec: 3.3,
    notes: 'Punchy 9-scene cuts, 4× TextPunch interleaving for momentum',
  },
  {
    url: 'https://vercel.com',
    brandName: 'Vercel',
    intent: 'tech',
    intentLabel: 'Tech deep-dive',
    intentEmoji: '🔬',
    sceneSequence: ['DeviceMockup', 'TextPunch', 'BentoGrid', 'CodeToUI', 'TextPunch', 'CTA'],
    sceneCount: 6,
    avgPaceSec: 5.0,
    notes: 'Slower pacing, opens directly with product (no preamble)',
  },
  {
    url: 'https://vercel.com',
    brandName: 'Vercel',
    intent: 'emotional',
    intentLabel: 'Emotional brand',
    intentEmoji: '💫',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'TextPunch', 'FeatureCallout', 'BentoGrid', 'CTA'],
    sceneCount: 6,
    avgPaceSec: 5.0,
    notes: 'Swaps CodeToUI/CursorDemo for FeatureCallout — outcome over implementation',
  },
  {
    url: 'https://www.duolingo.com',
    brandName: 'Duolingo',
    intent: 'hardsell',
    intentLabel: 'Hard-sell',
    intentEmoji: '🔥',
    sceneSequence: ['DeviceMockup', 'TextPunch', 'FeatureCallout', 'TextPunch', 'BentoGrid', 'TextPunch', 'SmoothScroll', 'CTA'],
    sceneCount: 8,
    avgPaceSec: 3.8,
    notes: 'SmoothScroll appears (consumer-app coded) — 3× TextPunch chain',
  },
  {
    url: 'https://www.duolingo.com',
    brandName: 'Duolingo',
    intent: 'tech',
    intentLabel: 'Tech deep-dive',
    intentEmoji: '🔬',
    sceneSequence: ['DeviceMockup', 'TextPunch', 'BentoGrid', 'SmoothScroll', 'CTA'],
    sceneCount: 5,
    avgPaceSec: 6.0,
    notes: 'Minimal scene set, longest avg pace — methodical walkthrough',
  },
  {
    url: 'https://www.duolingo.com',
    brandName: 'Duolingo',
    intent: 'emotional',
    intentLabel: 'Emotional brand',
    intentEmoji: '💫',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'TextPunch', 'BentoGrid', 'CTA'],
    sceneCount: 5,
    avgPaceSec: 6.0,
    notes: 'Opens with TextPunch hook (lifestyle aspiration before product reveal)',
  },
];
```

**IMPORTANT**: BEFORE committing, open the latest `docs/dev-notes/intent-spectrum-2026-04-28-supplement-*.md` and verify each cell's `sceneSequence`, `sceneCount`, `avgPaceSec` matches the report. The values above are best-effort approximations from the conversation history; the report is the source of truth.

- [ ] **Step 3: Create `apps/landing/src/components/IntentMatrix.tsx`**

```tsx
import { INTENT_MATRIX, type IntentMatrixCell } from '../data/intentMatrix';

export function IntentMatrix() {
  // Group cells by URL → 2 rows × 3 columns
  const byUrl = INTENT_MATRIX.reduce<Record<string, IntentMatrixCell[]>>((acc, cell) => {
    (acc[cell.url] ??= []).push(cell);
    return acc;
  }, {});

  return (
    <section className="py-24 bg-gray-900 text-white px-6">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-4xl md:text-5xl font-bold text-center mb-4">
          Same URL. Three intents. Three videos.
        </h2>
        <p className="text-xl text-gray-400 text-center mb-16 max-w-3xl mx-auto">
          The AI director adapts pacing, scene types, and copy to your goal. Real outputs from our intent-spectrum evaluation:
        </p>
        {Object.entries(byUrl).map(([url, cells]) => (
          <div key={url} className="mb-16">
            <h3 className="text-2xl font-semibold mb-2">{cells[0]!.brandName}</h3>
            <p className="text-sm text-gray-500 mb-6 break-all">{url}</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {cells.map((cell) => (
                <article
                  key={cell.intent}
                  className="border border-gray-700 rounded-lg p-6 hover:border-purple-500 transition"
                >
                  <div className="text-sm uppercase tracking-wide text-gray-400 flex items-center gap-2">
                    <span>{cell.intentEmoji}</span>
                    <span>{cell.intentLabel}</span>
                  </div>
                  <div className="mt-3 text-2xl font-bold">
                    {cell.sceneCount} scenes
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    avg {cell.avgPaceSec}s per scene
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1">
                    {cell.sceneSequence.map((scene, i) => (
                      <span
                        key={i}
                        className="bg-gray-800 text-xs px-2 py-1 rounded font-mono"
                      >
                        {scene}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-gray-400 italic">{cell.notes}</p>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Wire IntentMatrix into App.tsx**

Update `apps/landing/src/App.tsx`:

```tsx
import { Hero } from './components/Hero';
import { IntentMatrix } from './components/IntentMatrix';

export function App() {
  return (
    <main>
      <Hero />
      <IntentMatrix />
    </main>
  );
}
```

- [ ] **Step 5: Visual smoke + typecheck**

```bash
pnpm --filter @lumespec/landing typecheck
pnpm --filter @lumespec/landing dev
```
Open browser. Scroll past Hero to IntentMatrix section. Verify:
- 2 brand groups (Vercel, Duolingo) each show 3 columns
- Scene tags wrap nicely on mobile (375px width)
- Hover on a card → border turns purple
- Notes italic, smaller, gray

- [ ] **Step 6: Commit**

```bash
git add apps/landing/src/data/intentMatrix.ts apps/landing/src/components/IntentMatrix.tsx apps/landing/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(landing): intent-matrix showcase (vercel + duolingo, 6 real cells)

Data-driven 2×3 grid showing the same URL produces dramatically
different scene sequences depending on intent. All 6 cells transcribed
from the most recent intent-spectrum-eval supplement report (Day 2
9-cell verification, vercel + duolingo each 3/3 success).

Burton 3rd row deferred: 2/3 cells failed in the Day 2 run due to
Anthropic credit balance hitting zero, NOT a product bug. Future task
re-runs them after credit top-up and adds the burton row.

No video thumbnails in v1 — text-rich data display proves the "intent
matters" claim without 6× MP4 bandwidth cost. v1.5 enhancement: render
6 hero stills (1 per cell, ~50KB each PNG) and add img to each card.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Tally Embed + Footer

**Goal:** Waitlist section with embedded Tally form (form ID via build-time env), minimal footer.

**Files:**
- Create: `apps/landing/src/components/TallyEmbed.tsx`
- Create: `apps/landing/src/components/Footer.tsx`
- Modify: `apps/landing/src/App.tsx`

- [ ] **Step 1: Create `apps/landing/src/components/TallyEmbed.tsx`**

```tsx
import { useEffect } from 'react';

const TALLY_FORM_ID = import.meta.env.VITE_TALLY_FORM_ID ?? '';

export function TallyEmbed() {
  useEffect(() => {
    // Tally widget script attaches itself to .tally-iframe elements.
    // Only inject once even if component re-mounts (StrictMode double-renders).
    if (document.querySelector('script[src="https://tally.so/widgets/embed.js"]')) return;
    const script = document.createElement('script');
    script.src = 'https://tally.so/widgets/embed.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  if (!TALLY_FORM_ID) {
    return (
      <section id="waitlist" className="py-24 bg-black text-white px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Get early access</h2>
          <p className="text-gray-400 mb-6">
            Waitlist form coming soon. Set <code className="font-mono">VITE_TALLY_FORM_ID</code> at build time to enable.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="waitlist" className="py-24 bg-black text-white px-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-4">Get early access</h2>
        <p className="text-xl text-gray-400 text-center mb-12">
          Be the first to know when LumeSpec opens to public.
        </p>
        <iframe
          src={`https://tally.so/embed/${TALLY_FORM_ID}?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1`}
          loading="lazy"
          width="100%"
          height="500"
          title="LumeSpec waitlist"
          className="border-0"
        />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Create `apps/landing/src/components/Footer.tsx`**

```tsx
export function Footer() {
  return (
    <footer className="bg-black text-gray-500 py-12 px-6 border-t border-gray-800">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-sm">
          © {new Date().getFullYear()} LumeSpec. Made with{' '}
          <a
            href="https://github.com/chadcoco1444/LumeSpec"
            target="_blank"
            rel="noopener noreferrer"
            className="text-purple-400 hover:text-purple-300"
          >
            open source
          </a>
          .
        </div>
        <div className="flex gap-6 text-sm">
          <a
            href="https://github.com/chadcoco1444/LumeSpec"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition"
          >
            GitHub
          </a>
          <a href="#waitlist" className="hover:text-white transition">
            Waitlist
          </a>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Wire into App.tsx**

```tsx
import { Hero } from './components/Hero';
import { IntentMatrix } from './components/IntentMatrix';
import { TallyEmbed } from './components/TallyEmbed';
import { Footer } from './components/Footer';

export function App() {
  return (
    <main>
      <Hero />
      <IntentMatrix />
      <TallyEmbed />
      <Footer />
    </main>
  );
}
```

- [ ] **Step 4: Visual smoke without form ID**

```bash
pnpm --filter @lumespec/landing dev
```
Open browser. Scroll to waitlist section. Verify:
- Without `VITE_TALLY_FORM_ID` set, shows "Waitlist form coming soon" placeholder
- Footer renders at bottom with year + GitHub link
- Click "Get early access" in Hero → smooth-scrolls to waitlist section

- [ ] **Step 5: Build verification**

```bash
pnpm --filter @lumespec/landing typecheck
pnpm --filter @lumespec/landing build
```
Expected: clean. dist/ contains all assets.

- [ ] **Step 6: Commit**

```bash
git add apps/landing/src/components/TallyEmbed.tsx apps/landing/src/components/Footer.tsx apps/landing/src/App.tsx
git commit -m "$(cat <<'EOF'
feat(landing): tally embed (waitlist) + footer

TallyEmbed:
- Reads VITE_TALLY_FORM_ID at build time (set as GitHub Actions
  secret in T6 deploy; user creates Tally form manually first)
- Falls back to "coming soon" placeholder if env not set — landing
  remains functional during local dev without a Tally account
- Tally widget script loaded once via useEffect, idempotent across
  StrictMode double-renders
- iframe with dynamicHeight + transparent background per Tally
  embed best practice

Footer: minimal copyright + GitHub link + waitlist anchor.

App.tsx wires Hero → IntentMatrix → TallyEmbed → Footer.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: GitHub Actions Deploy Workflow

**Goal:** Push to main with `apps/landing/**` changes → automatic deploy to `chadcoco1444.github.io/LumeSpec/`.

**Files:**
- Create: `.github/workflows/deploy-landing.yml`

**External user actions REQUIRED before workflow first runs successfully**:
1. tally.so → register → create form with fields (Email required, Name optional, "Imagine LumeSpec exists today — what would you use it for?" open text optional) → copy form ID from URL
2. GitHub repo Settings → Secrets and variables → Actions → New repository secret → Name: `TALLY_FORM_ID` Value: <copied form ID>
3. GitHub repo Settings → Pages → Source: select **GitHub Actions** (NOT "Deploy from branch")

These 3 are MANUAL — agent cannot do them. Do them BEFORE pushing T6, or push T6 first to validate the workflow file shape (it'll deploy with the placeholder Tally fallback) and add secret + Pages source after.

- [ ] **Step 1: Create `.github/workflows/deploy-landing.yml`**

```yaml
name: Deploy Landing Page
on:
  push:
    branches: [main]
    paths:
      - 'apps/landing/**'
      - '.github/workflows/deploy-landing.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 9.0.0
      - uses: actions/setup-node@v4
        with:
          node-version: 20.11.1
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @lumespec/landing build
        env:
          VITE_TALLY_FORM_ID: ${{ secrets.TALLY_FORM_ID }}
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: apps/landing/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

- [ ] **Step 2: Verify YAML syntax**

```bash
cat .github/workflows/deploy-landing.yml
```
Visual check: 6-space indentation under `steps:` matches existing `.github/workflows/deploy.yaml`. No `[]` lint warnings if any YAML linter installed.

- [ ] **Step 3: Commit (does NOT trigger deploy yet — push triggers it)**

```bash
git add .github/workflows/deploy-landing.yml
git commit -m "$(cat <<'EOF'
ci(landing): GitHub Actions deploy workflow for landing page

Triggers:
- push to main with apps/landing/** path filter
- manual workflow_dispatch
- concurrency group=pages, cancel-in-progress (latest commit wins)

Build:
- pnpm install --frozen-lockfile
- pnpm --filter @lumespec/landing build with VITE_TALLY_FORM_ID
  injected from GitHub secret (set manually in repo settings)
- Upload apps/landing/dist via actions/upload-pages-artifact@v3

Deploy:
- actions/deploy-pages@v4 → GitHub Pages CDN

External setup required BEFORE first successful deploy (one-time,
agent cannot perform):
  1. Create Tally form, copy ID
  2. GitHub repo Settings → Secrets → add TALLY_FORM_ID
  3. GitHub repo Settings → Pages → Source = "GitHub Actions"
     (NOT "Deploy from branch")

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push entire feature to origin**

```bash
git push origin main
```
Expected: 6 commits land on origin/main (T1 → T6). The push triggers the deploy-landing workflow because `apps/landing/**` and `.github/workflows/deploy-landing.yml` both match the path filter.

- [ ] **Step 5: Watch first deploy**

Open `https://github.com/chadcoco1444/LumeSpec/actions` in browser. The latest workflow run should be "Deploy Landing Page". Watch the build job:

Expected outcome A — **all manual setup done before push**: build succeeds, deploy succeeds, GitHub Actions surface shows a `page_url` like `https://chadcoco1444.github.io/LumeSpec/`. Open URL → live site visible with real Tally form.

Expected outcome B — **manual setup not yet done**: build still succeeds (Tally fallback "coming soon" placeholder used), deploy fails because GitHub Pages source isn't set to "GitHub Actions". Failure message will guide: open repo Settings → Pages → switch source to "GitHub Actions" → re-run workflow manually.

- [ ] **Step 6: Post-deploy verification (after live URL accessible)**

In browser at `https://chadcoco1444.github.io/LumeSpec/`:
- Hero video autoplays muted, loops
- IntentMatrix displays 2 brand rows × 3 cells each
- Tally form (if secret set) loads in iframe; submit a test entry with throwaway email; verify it appears in Tally dashboard
- Footer GitHub link works
- Mobile width (375px Chrome devtools): all sections render reasonably

Network tab check:
- All assets load from `chadcoco1444.github.io/LumeSpec/` (no 404 from missing base path)
- demo-30s.mp4 served as `video/mp4`
- Tally iframe loads (if secret set)

Lighthouse check (Chrome devtools → Lighthouse → mobile + desktop):
- Performance > 90 (target)
- Accessibility > 90 (target)
- SEO > 80 (limited by no OG image / structured data in v1, acceptable)

---

## Self-Review

**Spec coverage:**
- T1 + T2 = workspace + Vite/Tailwind/skeleton (Component Spec 1 = vite.config in T2)
- T3 = Hero (Component Spec 2)
- T4 = IntentMatrix + data (Component Spec 3)
- T5 = TallyEmbed + Footer (Component Spec 4 = TallyEmbed; Footer added per spec File Structure listing)
- T6 = deploy workflow (Component Spec 5)

Out-of-scope items from spec are explicitly NOT covered — D2 custom domain, video thumbnails for matrix, other marketing pages, SEO/OG, analytics, i18n, deep mobile UX, backend. Confirmed not in plan.

External user actions explicitly called out (T6 step 0): Tally form creation, GitHub secrets, Pages source setting.

**Placeholder scan:**
- "TBD" / "TODO" / "implement later" / "fill in details" — none present
- Step 1 of T4 instructs reading the source report and transcribing — concrete instruction, not vague
- TallyEmbed's "coming soon" placeholder is INTENTIONAL behavior of the component (when env unset), not a plan placeholder

**Type consistency:**
- `IntentMatrixCell` interface defined in T4 step 2 — used identically in T4 step 3 (`Record<string, IntentMatrixCell[]>`).
- `TALLY_FORM_ID` constant naming consistent: `VITE_TALLY_FORM_ID` env var → `TALLY_FORM_ID` const → secret named `TALLY_FORM_ID`. All match.
- `Hero` href `#waitlist` → `TallyEmbed` section `id="waitlist"` matches.
- Component imports use named exports throughout (`import { Hero } from ...`); all components export named consistently.
