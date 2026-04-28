# Landing Page on GitHub Pages — Design

**Risk:** P2 — first public-facing surface for PMF validation
**Date:** 2026-04-28
**Status:** Approved — ready for implementation planning

---

## Problem

LumeSpec 開發 6 天累積 5 個 production-ready architectural ship + 完整 intent expressiveness empirical proof，但**對外 0 visibility** — 沒人知道這個 product 存在。

User 想先做 marketing-only landing page 達成兩個目標：
- 對外宣傳「LumeSpec 能根據 intent 動態生成不同風格短影片」這個核心價值
- 收集早期 waitlist 名單做 PMF validation

當前限制：用戶尚未準備好處理 production deploy 的 vendor decision（Railway / Supabase / 月費等），所以**第一階段純 static、零 backend、零月費**。

## Approaches Considered

| Approach | Pros | Cons |
|---|---|---|
| **A) 改造 Next.js 走 static export** | 高重用率（直接用既有 page.tsx）| `export const dynamic = 'force-dynamic'` + NextAuth server reads 阻擋 export；改完會綁死 main app 未來演化 |
| **B) 獨立 `apps/landing/` 純 Vite static site** ✅ | 與 main app 解耦、純 client React 元件可複製重用、Vite build 時間短、未來 Railway deploy main app 時零干擾 | 需要新建 `apps/landing/` 結構、約 70% 元件重用率（30% 路由邏輯需重寫） |
| **C) 純 HTML / Astro 重寫** | 維護成本最低、bundle 最小 | 拋棄既有 React 元件、學 Astro 增加摩擦 |

**Decision: B — 獨立 `apps/landing/` Vite static site.** 唯一在「重用既有元件」與「不污染 main app」之間取得最佳平衡的路徑。

## Sub-decisions Locked

- **(D1) GitHub Pages 預設 subpath**: `chadcoco1444.github.io/LumeSpec/` 第一階段 — Vite 設 `base: '/LumeSpec/'`。**24-48 小時內升級到 D2 custom domain**（買 `lumespec.com` 或 `.dev`），切換時 base 改 `/` + repo 加 `CNAME` file，code 改動 < 5 lines、無 downtime。
- **(W2 + W1) Tally form 主 + GitHub Stars 副**：Tally 收 email + 開放欄位「想用 LumeSpec 做什麼」(質性 PMF data)；副 CTA 連回 GitHub repo 收 stars（社群信任背書）。
- **CTA 並列、不互斥**：landing 頁同時呈現兩個按鈕、各收不同訊號。
- **GitHub Actions deploy** via `actions/deploy-pages@v4`（不用舊版 gh-pages branch source）。

## Architecture

```
GitHub Repo (push to main)
    ↓
GitHub Actions (.github/workflows/deploy-landing.yml)
    ↓
pnpm install + vite build apps/landing
    ↓
upload-pages-artifact (built dist/)
    ↓
deploy-pages → GitHub Pages CDN
    ↓
chadcoco1444.github.io/LumeSpec/  (D1, initial)
    or
lumespec.com  (D2, ~48hr later)
```

**Static-only constraint**：
- 0 backend (no API routes, no SSR, no dynamic imports of server modules)
- 0 環境變數依賴 runtime（build-time `import.meta.env` for Tally form ID 是 OK 的）
- All assets served from same origin（demo videos copy into landing's `public/`）

**Tally form integration**：
- Tally form 在 tally.so 後台建（一次性 manual setup）
- 拿到 `formId` 後嵌入 Tally iframe (Tally 提供官方 React 嵌入元件)
- Form submissions 直接收到 Tally dashboard、可導出 CSV

## File Structure

```
apps/landing/                              ← NEW package
├── package.json                           workspace member, react + vite + tailwind
├── vite.config.ts                         base: '/LumeSpec/'
├── tsconfig.json                          extends tsconfig.base
├── index.html                             vite entry
├── public/
│   ├── demo-30s.mp4                       copied from apps/web/public/
│   └── favicon.ico                        copied from apps/web/public/
└── src/
    ├── main.tsx                           ReactDOM render
    ├── App.tsx                            top-level layout
    ├── components/
    │   ├── Hero.tsx                       autoplay muted demo video + headline + dual CTA
    │   ├── IntentMatrix.tsx               2×3 (or 3×3 partial) data-driven matrix
    │   ├── TallyEmbed.tsx                 wraps Tally iframe
    │   ├── GitHubStarButton.tsx           anchor to repo
    │   └── Footer.tsx                     minimal links
    ├── data/
    │   └── intentMatrix.ts                hardcoded data from intent-spectrum reports
    └── styles/
        └── tailwind.css                   tailwind imports

.github/workflows/
└── deploy-landing.yml                     NEW — triggers on push to main + path filter
```

## Component Specs

### Component Spec 1 — `vite.config.ts`

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Bug #2 of GitHub Pages: subpath. Change to '/' when D2 custom domain wired.
  base: '/LumeSpec/',
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
  },
});
```

**D1→D2 migration**: when custom domain ready:
1. Change `base: '/LumeSpec/'` → `base: '/'`
2. Add `apps/landing/public/CNAME` file containing `lumespec.com` (or chosen domain)
3. Set DNS A records to GitHub Pages IPs
4. Wait DNS propagation (~1-24hr)
5. Verify HTTPS auto-provisioned by GitHub

### Component Spec 2 — `Hero.tsx`

```tsx
export function Hero() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="w-full max-w-4xl rounded-lg shadow-2xl"
        src={`${import.meta.env.BASE_URL}demo-30s.mp4`}
      />
      <h1 className="mt-12 text-5xl font-bold tracking-tight">
        AI-directed demo videos.<br />
        From any URL. In any voice.
      </h1>
      <p className="mt-6 text-xl text-gray-300 max-w-2xl text-center">
        Paste a URL, pick your intent — get a polished 30s demo video.
        No editing software. No reshoots. No stale assets.
      </p>
      <div className="mt-12 flex gap-4">
        <a href="#waitlist" className="bg-purple-600 px-8 py-4 rounded-lg font-semibold">
          Get early access →
        </a>
        <a href="https://github.com/chadcoco1444/LumeSpec" className="border border-white px-8 py-4 rounded-lg">
          ⭐ Star on GitHub
        </a>
      </div>
    </section>
  );
}
```

**Notes**:
- `autoPlay muted playsInline` — 必須 muted 才會 autoplay（瀏覽器政策），iOS Safari 需 playsInline
- `${import.meta.env.BASE_URL}` — Vite base 自動 prefix（D1 → `/LumeSpec/`，D2 → `/`），video src 跟 base 同步
- Headline 文案 draft 從 README 提煉、實作時 user 可調整
- 兩個 CTA 同樣大小同樣顯眼 — 維持「並列、不互斥」設計

### Component Spec 3 — `IntentMatrix.tsx` + `data/intentMatrix.ts`

Display: 2-column × 3-row grid initially（vercel + duolingo × 3 intents = 6 cells，全有 real data）。Burton row 設計成可後續加入第 3 row 但現在不顯示（因為 burton tech + emotional 因 Anthropic credit 用完 fail、未跑成功）。

**Data shape** (`data/intentMatrix.ts`):
```ts
export type Intent = 'hardsell' | 'tech' | 'emotional';
export type IntentMatrixCell = {
  url: string;
  brandName: string;
  brandColor: string;       // 從 intent-spectrum report 拉
  intent: Intent;
  intentLabel: string;       // "🔥 Hard-sell" / "🔬 Tech deep-dive" / "💫 Emotional brand story"
  sceneSequence: string[];   // ['TextPunch', 'DeviceMockup', 'TextPunch', 'CodeToUI', ...]
  sceneCount: number;
  avgPaceSec: number;
  notes?: string;            // optional human description, e.g., "fast cuts via 4× TextPunch"
};

export const INTENT_MATRIX: IntentMatrixCell[] = [
  // 6 cells initially, hardcoded from docs/dev-notes/intent-spectrum-2026-04-27.md (Day 1 final + Day 2 verified)
  // ... vercel × 3 intents (Day 2 verified data, 3/3 success)
  // ... duolingo × 3 intents (Day 2 verified data, 3/3 success)
];
```

**Component** (`IntentMatrix.tsx`):
```tsx
import { INTENT_MATRIX } from '../data/intentMatrix';

export function IntentMatrix() {
  // Group cells by URL → 2 rows × 3 columns
  const byUrl = INTENT_MATRIX.reduce((acc, cell) => {
    (acc[cell.url] ??= []).push(cell);
    return acc;
  }, {} as Record<string, IntentMatrixCell[]>);

  return (
    <section className="py-24 bg-gray-900 text-white">
      <h2 className="text-4xl font-bold text-center mb-4">
        Same URL. Three intents. Three videos.
      </h2>
      <p className="text-xl text-gray-400 text-center mb-16">
        The AI director adapts pacing, scene types, and copy to your goal.
      </p>
      <div className="max-w-7xl mx-auto px-8">
        {Object.entries(byUrl).map(([url, cells]) => (
          <div key={url} className="mb-12">
            <h3 className="text-2xl font-semibold mb-4">{cells[0]!.brandName}</h3>
            <div className="grid grid-cols-3 gap-4">
              {cells.map((cell) => (
                <article key={cell.intent} className="border border-gray-700 rounded-lg p-6">
                  <div className="text-sm uppercase tracking-wide text-gray-400">
                    {cell.intentLabel}
                  </div>
                  <div className="mt-2 text-2xl font-bold">
                    {cell.sceneCount} scenes / {cell.avgPaceSec}s avg
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1 text-xs">
                    {cell.sceneSequence.map((scene, i) => (
                      <span key={i} className="bg-gray-800 px-2 py-1 rounded">
                        {scene}
                      </span>
                    ))}
                  </div>
                  {cell.notes && (
                    <p className="mt-4 text-sm text-gray-400 italic">{cell.notes}</p>
                  )}
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

**Why no video thumbnails initially**: would require rendering 6 actual MP4s (each ~2-5MB) and embedding them — slow page load. Text-rich data display proves the "intent matters" claim convincingly without bandwidth cost. v1.5 enhancement: render 6 hero stills (1 per cell, ~50KB each PNG) and add `<img>` to each card.

### Component Spec 4 — `TallyEmbed.tsx`

Tally form embed via official Tally widget script. Form ID acquired manually by user from tally.so dashboard (one-time).

```tsx
// data/tally.ts
export const TALLY_FORM_ID = import.meta.env.VITE_TALLY_FORM_ID ?? 'mEXAMPLE'; // set in .env.production

// components/TallyEmbed.tsx
import { useEffect } from 'react';
import { TALLY_FORM_ID } from '../data/tally';

export function TallyEmbed() {
  useEffect(() => {
    // Load Tally widget script once
    const script = document.createElement('script');
    script.src = 'https://tally.so/widgets/embed.js';
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  return (
    <section id="waitlist" className="py-24 bg-black text-white">
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
        className="max-w-2xl mx-auto"
      />
    </section>
  );
}
```

**Tally form fields (manual setup in tally.so dashboard)**:
- Email (required)
- Name (optional)
- "Imagine LumeSpec exists today — what would you use it for?" (open text, optional but invaluable for PMF signal)

**Form ID injection**: via `apps/landing/.env.production` (gitignored) for local builds, **GitHub Actions secret** `VITE_TALLY_FORM_ID` for prod builds.

### Component Spec 5 — `.github/workflows/deploy-landing.yml`

```yaml
name: Deploy Landing Page
on:
  push:
    branches: [main]
    paths:
      - 'apps/landing/**'
      - '.github/workflows/deploy-landing.yml'
  workflow_dispatch:  # allow manual trigger

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

**Triggers**: push to main if `apps/landing/**` changed, OR manual `workflow_dispatch`. Path filter prevents triggering on Bug fixes / non-landing changes.

**Concurrency**: `cancel-in-progress` — if multiple commits hit fast, only the latest builds.

**Required secret**: `TALLY_FORM_ID` (user creates in GitHub repo Settings → Secrets → Actions before first deploy).

**Required GitHub Pages config** (one-time, manual):
1. Repo Settings → Pages
2. Source: **GitHub Actions**（NOT "Deploy from branch"）
3. Done — workflow handles everything

## Files Changed

| File | Status | Owner |
|---|---|---|
| `apps/landing/package.json` | NEW | task creates |
| `apps/landing/vite.config.ts` | NEW | task creates |
| `apps/landing/tsconfig.json` | NEW | task creates |
| `apps/landing/index.html` | NEW | task creates |
| `apps/landing/src/main.tsx` | NEW | task creates |
| `apps/landing/src/App.tsx` | NEW | task creates |
| `apps/landing/src/components/Hero.tsx` | NEW | task creates |
| `apps/landing/src/components/IntentMatrix.tsx` | NEW | task creates |
| `apps/landing/src/components/TallyEmbed.tsx` | NEW | task creates |
| `apps/landing/src/components/GitHubStarButton.tsx` | NEW | task creates |
| `apps/landing/src/components/Footer.tsx` | NEW | task creates |
| `apps/landing/src/data/intentMatrix.ts` | NEW | task creates (hardcoded from intent-spectrum reports) |
| `apps/landing/src/styles/tailwind.css` | NEW | task creates |
| `apps/landing/public/demo-30s.mp4` | NEW (copied from apps/web/public/) | task creates |
| `apps/landing/public/favicon.ico` | NEW (copied from apps/web/public/) | task creates |
| `apps/landing/postcss.config.cjs` | NEW | task creates (tailwind setup) |
| `apps/landing/tailwind.config.cjs` | NEW | task creates |
| `pnpm-workspace.yaml` | MODIFY | add `apps/landing` to workspace (might already cover via `apps/*`)|
| `.github/workflows/deploy-landing.yml` | NEW | task creates |

**External user actions** (not in plan, user does manually):
1. Create Tally form at tally.so → copy form ID
2. GitHub repo Settings → Secrets → Actions → add `TALLY_FORM_ID`
3. GitHub repo Settings → Pages → Source = "GitHub Actions"

## Out of Scope (explicitly deferred)

- **D2 custom domain** (`lumespec.com` 等) — separate 1-line spec when domain purchased + DNS configured (~24-48hr from D1 ship)
- **Video thumbnails for IntentMatrix cells** — would require rendering 6 actual stills via Remotion; v1.5 enhancement
- **Other marketing pages** (`/about`, `/features`, `/blog` etc. that exist in apps/web) — landing-only is current goal
- **SEO / OG tags optimization** — basic `<meta>` tags only in v1; OG image generation, sitemap, structured data are v1.5
- **Analytics** (Plausible, GA, Posthog) — explicit business decision deferred; revisit when waitlist hits 50+ signups
- **Internationalization** — single-language (English) v1
- **Mobile responsive deep optimization** — basic Tailwind responsive classes only; comprehensive mobile UX is v1.5
- **Backend integration** — explicitly NO backend in v1 per spec foundation

## Testing Strategy

**No unit tests for landing components** — pure UI, fast manual verification, components don't have algorithmic logic worth testing.

**Build verification**:
```bash
pnpm --filter @lumespec/landing build
```
Expected: `dist/` produced, includes `index.html`, hashed JS/CSS bundles, copied public assets. Total bundle size target < 500KB (excluding video).

**Local preview**:
```bash
pnpm --filter @lumespec/landing preview
```
Expected: serves on `http://localhost:4173/LumeSpec/` (matching production base path).

**Visual smoke test** (manual, 5 min):
1. Hero loads, video autoplays muted, both CTAs clickable
2. IntentMatrix renders 2 rows × 3 columns with text
3. Tally iframe loads (or shows placeholder if `VITE_TALLY_FORM_ID` not set)
4. Footer present
5. Inspect at mobile width (375px) — basic responsive sanity

**Post-deploy verification**:
1. `https://chadcoco1444.github.io/LumeSpec/` loads (D1 phase)
2. Asset paths resolve (no 404 in browser console)
3. Tally form submission test (use throwaway email)
4. GitHub Star button links to correct repo

**Lighthouse target** (one-shot quality gate):
- Performance > 90
- Accessibility > 90
- SEO > 80 (limited by lack of OG image / structured data in v1)

## D1 → D2 Migration Path (post-launch)

When user purchases custom domain (e.g., `lumespec.com`):

1. **DNS setup** at registrar:
   - 4 A records → GitHub Pages IPs:
     - `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Optional CNAME for `www`: `chadcoco1444.github.io`
2. **Repo changes** (1 PR):
   - `apps/landing/vite.config.ts`: `base: '/LumeSpec/'` → `base: '/'`
   - `apps/landing/public/CNAME`: NEW file with single line `lumespec.com`
3. **GitHub repo Settings → Pages**:
   - Custom domain field: `lumespec.com`
   - Wait HTTPS auto-provision (~5-30 min)
4. **Verify**: `https://lumespec.com` loads, redirects from old subpath URL.

Total work post-domain-purchase: ~15 min code + 1-24hr DNS propagation wait.
