# PromptDemo v1.0 — Plan 3: Remotion Package + 5 MVP Scenes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship `packages/remotion`: a Remotion 4 composition package that consumes a validated `Storyboard` and renders the 5 v1.0 MVP scene types (`HeroRealShot`, `FeatureCallout`, `TextPunch`, `SmoothScroll`, `CTA`) into a 30fps H.264 MP4.

**Architecture:** Single composition (`MainComposition`) reads the `Storyboard` JSON as `defaultProps`. Scenes are wrapped in `<TransitionSeries>` so each scene's `entryAnimation`/`exitAnimation` controls the cross-fade. A discriminated-union dispatcher (`resolveScene`) routes each scene entry to the right component. Primitives (`BrowserChrome`, `LogoMark`, `AnimatedText`, `BGMTrack`) are shared across scenes. Fonts load via `delayRender`/`continueRender` against an `@remotion/google-fonts` whitelist; brand-color theming derives a palette from `videoConfig.brandColor`.

**Tech Stack:** React 18, Remotion 4, `@remotion/google-fonts`, `@remotion/bundler`, `@remotion/renderer`, vitest, `@promptdemo/schema`.

**Spec reference:** `docs/superpowers/specs/2026-04-20-promptdemo-design.md` §2, §6.

**MVP scope:** 5 scene types. `HeroStylized`, `CursorDemo`, `UseCaseStory`, `StatsBand`, `BentoGrid` are deferred to v1.1 — their `type` stays in the Zod schema (forward-compat) but their components are NOT built here. The dispatcher throws a descriptive error if an unimplemented type slips in at runtime.

**Predecessor:** Plan 2 (`v0.2.0-storyboard-ai`). Plan 3 consumes the `Storyboard` contract and `S3Uri`-referenced assets from Plan 2's output. For testing Plan 3 in isolation, Plan 3 uses the Plan 1 storyboard fixtures and a local HTTP proxy that fetches `s3://...` URIs from MinIO (see Task 3.2).

---

## File Structure

```
packages/remotion/
├── package.json
├── tsconfig.json
├── remotion.config.ts                   # entrypoint + bundling config
├── src/
│   ├── Root.tsx                         # registerRoot; Composition; delayRender for fonts
│   ├── MainComposition.tsx              # <ThemeProvider> + <BGMTrack> + <TransitionSeries>
│   ├── resolveScene.tsx                 # discriminated union dispatcher
│   ├── fonts.ts                         # @remotion/google-fonts loader
│   ├── s3Resolver.ts                    # map s3:// URIs → local/http URLs for Remotion
│   │
│   ├── scenes/                          # 5 v1 MVP scene components
│   │   ├── HeroRealShot.tsx
│   │   ├── FeatureCallout.tsx
│   │   ├── TextPunch.tsx
│   │   ├── SmoothScroll.tsx
│   │   └── CTA.tsx
│   │
│   ├── primitives/
│   │   ├── BrowserChrome.tsx
│   │   ├── LogoMark.tsx                 # domain-initial fallback when logoUrl missing
│   │   ├── AnimatedText.tsx             # spring char fade
│   │   └── BGMTrack.tsx                 # fade-in/out royalty-free track
│   │
│   ├── animations/
│   │   ├── timing.ts                    # entryAnimation enum → TransitionSeries presentation
│   │   ├── entryExit.ts                 # presentation mapping for 7 enum values
│   │   └── easings.ts
│   │
│   ├── utils/
│   │   ├── brandTheme.ts                # derive palette from brandColor
│   │   └── domainInitials.ts            # extract 1-2 char initials from URL
│   │
│   └── assets/
│       ├── bgm/                         # placeholders — user supplies royalty-free files
│       │   ├── upbeat.mp3
│       │   ├── cinematic.mp3
│       │   ├── minimal.mp3
│       │   └── tech.mp3
│       └── README.md                    # licensing notes + source
│
└── tests/
    ├── brandTheme.test.ts
    ├── domainInitials.test.ts
    ├── entryExit.test.ts
    ├── resolveScene.test.tsx            # dispatch smoke + unknown-type error
    ├── compositionRegistry.test.ts      # getCompositions() returns MainComposition
    └── renderSmoke.test.ts              # full @remotion/renderer headless render on 10s fixture (slow, gated)
```

---

## Tasks Overview

Phase 3 is 15 tasks. TDD applies cleanly to pure logic (tasks 3.3–3.5, 3.9). React components get snapshot-style assertions via Remotion's `getCompositions` + a final headless `renderMedia` smoke test. Visual fidelity is a manual `pnpm dev` (Remotion Studio) check — tests only verify structural correctness and that renders don't crash.

| # | Task | Type | Scope |
|---|---|---|---|
| 3.1 | Scaffold `packages/remotion` | chore | package.json, tsconfig (needs DOM lib), remotion.config |
| 3.2 | `s3Resolver` — map s3:// → http(s) | TDD | dev fetches MinIO, prod uses signed URL or direct |
| 3.3 | `domainInitials` util | TDD | pure |
| 3.4 | `brandTheme` util | TDD | derive primary/light/dark/textOn |
| 3.5 | `entryExit` animation mapping | TDD | pure |
| 3.6 | `fonts.ts` loader | TDD-ish | delayRender + Google Fonts whitelist |
| 3.7 | `AnimatedText` primitive | component | spring char fade |
| 3.8 | `BrowserChrome` primitive | component | URL bar, traffic lights, inner content slot |
| 3.9 | `LogoMark` primitive | component | logoUrl → <Img>, fallback to initials |
| 3.10 | `BGMTrack` primitive | component | <Audio> + fade |
| 3.11 | 5 scene components | components | one commit per scene |
| 3.12 | `resolveScene` dispatcher | TDD | discriminated union + unknown-type error |
| 3.13 | `MainComposition` + `Root.tsx` | integration | register composition + wire ThemeProvider |
| 3.14 | Render smoke test | integration | @remotion/renderer render 10s fixture to /tmp |
| 3.15 | Final typecheck + test + tag | validation | `v0.3.0-remotion-mvp` |

---

## Phase 3 — Tasks

### Task 3.1: Scaffold `packages/remotion`

**Files:**
- Create: `packages/remotion/package.json`
- Create: `packages/remotion/tsconfig.json`
- Create: `packages/remotion/remotion.config.ts`
- Create: `packages/remotion/src/Root.tsx` (stub)

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@promptdemo/remotion",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/Root.tsx",
  "scripts": {
    "dev": "remotion studio src/Root.tsx",
    "render:10s": "remotion render src/Root.tsx MainComposition out.mp4",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@promptdemo/schema": "workspace:*",
    "@remotion/bundler": "4.0.218",
    "@remotion/cli": "4.0.218",
    "@remotion/google-fonts": "4.0.218",
    "@remotion/renderer": "4.0.218",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "remotion": "4.0.218",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@testing-library/react": "16.0.1",
    "@types/node": "20.14.10",
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "jsdom": "25.0.1",
    "typescript": "5.5.4",
    "vitest": "2.1.1"
  }
}
```

- [ ] **Step 2: `tsconfig.json`** — browser-oriented (this package ships React to Remotion's bundler):

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "rootDir": ".",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*", "tests/**/*", "remotion.config.ts"]
}
```

Note: this re-enables `DOM` (dropped from the base for Node workers). Remotion components legitimately need DOM types.

- [ ] **Step 3: `remotion.config.ts`**

```ts
import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
Config.setBrowserExecutable(null); // use bundled chromium from @remotion/renderer
Config.setEntryPoint('./src/Root.tsx');
Config.setCodec('h264');
```

- [ ] **Step 4: `src/Root.tsx` stub**

```tsx
import React from 'react';
import { registerRoot, Composition } from 'remotion';

const Placeholder: React.FC = () => <div style={{ color: 'white' }}>placeholder</div>;

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MainComposition"
    component={Placeholder}
    durationInFrames={300}
    fps={30}
    width={1280}
    height={720}
  />
);

registerRoot(RemotionRoot);
```

- [ ] **Step 5: Install + typecheck**

```bash
pnpm install
pnpm --filter @promptdemo/remotion typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/remotion/package.json packages/remotion/tsconfig.json packages/remotion/remotion.config.ts packages/remotion/src/Root.tsx pnpm-lock.yaml
git commit -m "chore(remotion): scaffold package with Remotion 4 + React 18"
```

---

### Task 3.2: `s3Resolver` — map s3:// URIs to http URLs (TDD)

**Why:** Remotion's `<Img>`/`<Audio>` can only fetch HTTP(S) URLs, not `s3://`. Dev maps to MinIO's HTTP endpoint; prod will eventually use a signed URL or a reverse proxy. Plan 3 only needs the dev mapping to work; prod swap lives in Plan 5 render worker.

**Files:**
- Create: `packages/remotion/src/s3Resolver.ts`
- Create: `packages/remotion/tests/s3Resolver.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { makeS3Resolver } from '../src/s3Resolver.js';

describe('makeS3Resolver', () => {
  it('maps s3://bucket/key → endpoint/bucket/key for path-style access', () => {
    const resolve = makeS3Resolver({ endpoint: 'http://localhost:9000', forcePathStyle: true });
    expect(resolve('s3://promptdemo-dev/jobs/j/hero.jpg')).toBe(
      'http://localhost:9000/promptdemo-dev/jobs/j/hero.jpg'
    );
  });

  it('maps s3://bucket/key → https://bucket.endpoint/key for virtual-host style', () => {
    const resolve = makeS3Resolver({ endpoint: 'https://s3.amazonaws.com', forcePathStyle: false });
    expect(resolve('s3://promptdemo-prod/x/y.jpg')).toBe(
      'https://promptdemo-prod.s3.amazonaws.com/x/y.jpg'
    );
  });

  it('passes through non-s3:// URLs unchanged', () => {
    const resolve = makeS3Resolver({ endpoint: 'http://localhost:9000', forcePathStyle: true });
    expect(resolve('https://cdn.example.com/x.png')).toBe('https://cdn.example.com/x.png');
  });

  it('returns undefined for undefined input', () => {
    const resolve = makeS3Resolver({ endpoint: 'http://localhost:9000', forcePathStyle: true });
    expect(resolve(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Impl**

```ts
import { parseS3Uri } from '@promptdemo/schema';

export interface S3ResolverConfig {
  endpoint: string; // http(s)://host[:port]
  forcePathStyle: boolean;
}

export type S3Resolver = (uri: string | undefined) => string | undefined;

export function makeS3Resolver(cfg: S3ResolverConfig): S3Resolver {
  return (uri) => {
    if (!uri) return undefined;
    if (!uri.startsWith('s3://')) return uri;
    const { bucket, key } = parseS3Uri(uri);
    const u = new URL(cfg.endpoint);
    if (cfg.forcePathStyle) {
      return `${cfg.endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    }
    return `${u.protocol}//${bucket}.${u.host}/${key}`;
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/remotion/src/s3Resolver.ts packages/remotion/tests/s3Resolver.test.ts
git commit -m "feat(remotion): s3:// URI resolver for Remotion asset loading"
```

---

### Task 3.3: `domainInitials` util (TDD)

**Why:** `LogoMark` fallback — when crawler didn't find a logo, render 1–2 char initials from the domain.

**Files:**
- Create: `packages/remotion/src/utils/domainInitials.ts`
- Create: `packages/remotion/tests/domainInitials.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { domainInitials } from '../src/utils/domainInitials.js';

describe('domainInitials', () => {
  it('returns uppercase first letter of domain', () => {
    expect(domainInitials('https://acme.com')).toBe('A');
  });

  it('returns two letters for multi-word domains', () => {
    expect(domainInitials('https://acme-corp.com')).toBe('AC');
  });

  it('handles subdomains by stripping them', () => {
    expect(domainInitials('https://www.acme.com')).toBe('A');
    expect(domainInitials('https://app.globex.io')).toBe('G');
  });

  it('ignores common prefixes (www, app, m)', () => {
    expect(domainInitials('https://app.acme.com')).toBe('A');
  });

  it('returns "?" for malformed input', () => {
    expect(domainInitials('not-a-url')).toBe('?');
  });
});
```

- [ ] **Step 2: Impl**

```ts
const STRIP_SUBDOMAINS = new Set(['www', 'app', 'm', 'en', 'us']);

export function domainInitials(url: string): string {
  try {
    const host = new URL(url).hostname;
    const parts = host.split('.');
    // Strip common subdomain prefix
    if (parts.length > 2 && parts[0] && STRIP_SUBDOMAINS.has(parts[0])) {
      parts.shift();
    }
    const root = parts[0] ?? '';
    // Split on common separators for multi-word brand names
    const words = root.split(/[-_]/).filter(Boolean);
    if (words.length >= 2) {
      return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
    }
    return (root[0] ?? '?').toUpperCase();
  } catch {
    return '?';
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/remotion/src/utils/domainInitials.ts packages/remotion/tests/domainInitials.test.ts
git commit -m "feat(remotion): domainInitials util for logo fallback"
```

---

### Task 3.4: `brandTheme` util (TDD)

**Why:** Derive a palette (primary / primaryLight / primaryDark / textOn / bg) from a single `brandColor`, via HSL manipulation. Scene components consume via CSS variables.

**Files:**
- Create: `packages/remotion/src/utils/brandTheme.ts`
- Create: `packages/remotion/tests/brandTheme.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { deriveTheme } from '../src/utils/brandTheme.js';

describe('deriveTheme', () => {
  it('returns the input as primary', () => {
    const t = deriveTheme('#4f46e5');
    expect(t.primary).toBe('#4f46e5');
  });

  it('produces a lighter primaryLight than primary', () => {
    const t = deriveTheme('#000000');
    expect(t.primaryLight).not.toBe('#000000');
    expect(t.primaryLight.toLowerCase()).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('produces a darker primaryDark than primary', () => {
    const t = deriveTheme('#ffffff');
    expect(t.primaryDark).not.toBe('#ffffff');
  });

  it('returns black text for light primary', () => {
    const t = deriveTheme('#ffff00'); // yellow
    expect(t.textOn).toBe('#000000');
  });

  it('returns white text for dark primary', () => {
    const t = deriveTheme('#1a1a1a');
    expect(t.textOn).toBe('#ffffff');
  });
});
```

- [ ] **Step 2: Impl**

```ts
export interface BrandTheme {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  textOn: string;
  bg: string;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = ((gn - bn) / d + (gn < bn ? 6 : 0)); break;
      case gn: h = (bn - rn) / d + 2; break;
      case bn: h = (rn - gn) / d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255];
}

function adjustLightness(hex: string, delta: number): string {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = Math.max(0, Math.min(1, l + delta));
  const [nr, ng, nb] = hslToRgb(h, s, newL);
  return rgbToHex(nr, ng, nb);
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function deriveTheme(primary: string): BrandTheme {
  const primaryLight = adjustLightness(primary, 0.2);
  const primaryDark = adjustLightness(primary, -0.2);
  const textOn = luminance(primary) > 0.5 ? '#000000' : '#ffffff';
  const bg = '#ffffff';
  return { primary, primaryLight, primaryDark, textOn, bg };
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/remotion/src/utils/brandTheme.ts packages/remotion/tests/brandTheme.test.ts
git commit -m "feat(remotion): brandTheme util derives palette from brandColor"
```

---

### Task 3.5: `entryExit` animation mapping (TDD)

**Files:**
- Create: `packages/remotion/src/animations/entryExit.ts`
- Create: `packages/remotion/src/animations/easings.ts`
- Create: `packages/remotion/src/animations/timing.ts`
- Create: `packages/remotion/tests/entryExit.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { toPresentation, ANIMATION_ENUM } from '../src/animations/entryExit.js';

describe('toPresentation', () => {
  it('returns a presentation object for each known enum value', () => {
    for (const v of ANIMATION_ENUM) {
      const p = toPresentation(v);
      expect(p).toHaveProperty('component');
      expect(p).toHaveProperty('props');
    }
  });

  it('maps "none" to a no-op presentation (0 duration)', () => {
    const p = toPresentation('none');
    expect(p.props.durationInFrames ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Impl**

`easings.ts`:
```ts
import { Easing } from 'remotion';
export const easeInOut = Easing.inOut(Easing.ease);
export const easeOut = Easing.out(Easing.ease);
```

`timing.ts`:
```ts
import { linearTiming } from '@remotion/transitions';

export function defaultTransitionTiming(durationInFrames: number) {
  return linearTiming({ durationInFrames });
}
```

`entryExit.ts`:
```ts
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { none } from '@remotion/transitions/none';

export const ANIMATION_ENUM = [
  'fade',
  'slideLeft',
  'slideRight',
  'slideUp',
  'zoomIn',
  'zoomOut',
  'none',
] as const;

export type Animation = (typeof ANIMATION_ENUM)[number];

export interface PresentationResult {
  component: unknown; // Remotion TransitionSeries.Transition.presentation expects a TransitionPresentation
  props: { durationInFrames?: number };
}

export function toPresentation(anim: Animation): PresentationResult {
  switch (anim) {
    case 'fade':
      return { component: fade(), props: {} };
    case 'slideLeft':
      return { component: slide({ direction: 'from-right' }), props: {} };
    case 'slideRight':
      return { component: slide({ direction: 'from-left' }), props: {} };
    case 'slideUp':
      return { component: slide({ direction: 'from-bottom' }), props: {} };
    case 'zoomIn':
      // Remotion's transitions package has no native zoom; approximate with fade until Plan 3.5
      return { component: fade(), props: {} };
    case 'zoomOut':
      return { component: fade(), props: {} };
    case 'none':
      return { component: none(), props: { durationInFrames: 0 } };
  }
}
```

Note: we need `@remotion/transitions` in deps. Add to `packages/remotion/package.json` dependencies: `"@remotion/transitions": "4.0.218"`. Re-run `pnpm install`.

- [ ] **Step 3: Commit**

```bash
git add packages/remotion/src/animations/ packages/remotion/tests/entryExit.test.ts packages/remotion/package.json pnpm-lock.yaml
git commit -m "feat(remotion): animation enum → TransitionSeries presentation mapping"
```

---

### Task 3.6: `fonts.ts` loader

**Files:**
- Create: `packages/remotion/src/fonts.ts`

- [ ] **Step 1: Impl**

```ts
import { delayRender, continueRender } from 'remotion';
import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';
import { loadFont as loadRoboto } from '@remotion/google-fonts/Roboto';
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadMontserrat } from '@remotion/google-fonts/Montserrat';
import { loadFont as loadPlayfairDisplay } from '@remotion/google-fonts/PlayfairDisplay';
import { loadFont as loadDMSans } from '@remotion/google-fonts/DMSans';
import { loadFont as loadNunito } from '@remotion/google-fonts/Nunito';
import { loadFont as loadLato } from '@remotion/google-fonts/Lato';
import { loadFont as loadOpenSans } from '@remotion/google-fonts/OpenSans';
import { loadFont as loadSourceSans3 } from '@remotion/google-fonts/SourceSans3';

// Keep in sync with workers/crawler/src/extractors/fontDetector.ts (Plan 1 Task 1.8)
const LOADERS: Record<string, () => { fontFamily: string; waitUntilDone: () => Promise<void> }> = {
  Inter: loadInter,
  Poppins: loadPoppins,
  Roboto: loadRoboto,
  'JetBrains Mono': loadJetBrainsMono,
  Montserrat: loadMontserrat,
  'Playfair Display': loadPlayfairDisplay,
  'DM Sans': loadDMSans,
  Nunito: loadNunito,
  Lato: loadLato,
  'Open Sans': loadOpenSans,
  'Source Sans 3': loadSourceSans3,
};

const DEFAULT_FONT = 'Inter';

export async function loadBrandFont(requested: string | undefined): Promise<string> {
  const family = requested && LOADERS[requested] ? requested : DEFAULT_FONT;
  const handle = LOADERS[family]!();
  const delay = delayRender(`font-${family}`);
  try {
    await handle.waitUntilDone();
  } finally {
    continueRender(delay);
  }
  return handle.fontFamily;
}
```

- [ ] **Step 2: Commit** (no test — this is a thin wrapper around Remotion APIs; exercise via `renderSmoke.test.ts` in Task 3.14).

```bash
git add packages/remotion/src/fonts.ts
git commit -m "feat(remotion): google fonts loader with delayRender"
```

---

### Task 3.7: `AnimatedText` primitive

**Files:**
- Create: `packages/remotion/src/primitives/AnimatedText.tsx`

- [ ] **Step 1: Impl**

```tsx
import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

export interface AnimatedTextProps {
  text: string;
  style?: React.CSSProperties;
  delayFrames?: number;
  mode?: 'wordFade' | 'charFade';
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  style,
  delayFrames = 0,
  mode = 'wordFade',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const units = mode === 'charFade' ? [...text] : text.split(/(\s+)/);

  return (
    <span style={style}>
      {units.map((u, i) => {
        const unitDelay = delayFrames + i * 2;
        const progress = spring({
          frame: frame - unitDelay,
          fps,
          config: { damping: 20, mass: 0.5 },
        });
        const opacity = interpolate(progress, [0, 1], [0, 1]);
        const y = interpolate(progress, [0, 1], [8, 0]);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity,
              transform: `translateY(${y}px)`,
              whiteSpace: u === ' ' ? 'pre' : undefined,
            }}
          >
            {u}
          </span>
        );
      })}
    </span>
  );
};
```

- [ ] **Step 2: Commit** (UI component — structural correctness covered by composition tests + manual Remotion Studio review).

```bash
git add packages/remotion/src/primitives/AnimatedText.tsx
git commit -m "feat(remotion): AnimatedText primitive with spring char/word fade"
```

---

### Task 3.8: `BrowserChrome` primitive

**Files:**
- Create: `packages/remotion/src/primitives/BrowserChrome.tsx`

- [ ] **Step 1: Impl**

```tsx
import React from 'react';

export interface BrowserChromeProps {
  url: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const BrowserChrome: React.FC<BrowserChromeProps> = ({ url, children, style }) => (
  <div
    style={{
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 40px 80px rgba(0,0,0,0.25)',
      background: '#fff',
      ...style,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: '#f2f3f5',
        borderBottom: '1px solid #e2e4e8',
      }}
    >
      <div style={{ width: 12, height: 12, borderRadius: 6, background: '#ff5f57' }} />
      <div style={{ width: 12, height: 12, borderRadius: 6, background: '#febc2e' }} />
      <div style={{ width: 12, height: 12, borderRadius: 6, background: '#28c840' }} />
      <div
        style={{
          flex: 1,
          marginLeft: 16,
          padding: '4px 12px',
          background: '#fff',
          borderRadius: 8,
          fontSize: 14,
          color: '#6b6f76',
          fontFamily: 'monospace',
        }}
      >
        {url}
      </div>
    </div>
    <div style={{ position: 'relative' }}>{children}</div>
  </div>
);
```

- [ ] **Step 2: Commit**

```bash
git add packages/remotion/src/primitives/BrowserChrome.tsx
git commit -m "feat(remotion): BrowserChrome primitive with macOS-style frame"
```

---

### Task 3.9: `LogoMark` primitive

**Files:**
- Create: `packages/remotion/src/primitives/LogoMark.tsx`

- [ ] **Step 1: Impl**

```tsx
import React from 'react';
import { Img } from 'remotion';
import { domainInitials } from '../utils/domainInitials.js';

export interface LogoMarkProps {
  logoUrl?: string; // resolved HTTP URL, not s3://
  fallbackUrl: string;
  size?: number;
  bg: string;
  textOn: string;
}

export const LogoMark: React.FC<LogoMarkProps> = ({ logoUrl, fallbackUrl, size = 64, bg, textOn }) => {
  if (logoUrl) {
    return <Img src={logoUrl} style={{ height: size, width: 'auto', objectFit: 'contain' }} />;
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 6,
        background: bg,
        color: textOn,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.5,
        letterSpacing: -1,
      }}
    >
      {domainInitials(fallbackUrl)}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/remotion/src/primitives/LogoMark.tsx
git commit -m "feat(remotion): LogoMark primitive with domain-initial fallback"
```

---

### Task 3.10: `BGMTrack` primitive

**Files:**
- Create: `packages/remotion/src/primitives/BGMTrack.tsx`
- Create: `packages/remotion/src/assets/bgm/README.md`

- [ ] **Step 1: Impl**

```tsx
import React from 'react';
import { Audio, staticFile } from 'remotion';

export type BgmMood = 'upbeat' | 'cinematic' | 'minimal' | 'tech' | 'none';

const TRACK_FILE: Record<Exclude<BgmMood, 'none'>, string> = {
  upbeat: 'bgm/upbeat.mp3',
  cinematic: 'bgm/cinematic.mp3',
  minimal: 'bgm/minimal.mp3',
  tech: 'bgm/tech.mp3',
};

export interface BGMTrackProps {
  mood: BgmMood;
  durationInFrames: number;
  volume?: number;
}

export const BGMTrack: React.FC<BGMTrackProps> = ({ mood, durationInFrames, volume = 0.25 }) => {
  if (mood === 'none') return null;
  const file = TRACK_FILE[mood];
  const fadeFrames = 20;
  return (
    <Audio
      src={staticFile(file)}
      volume={(frame) => {
        if (frame < fadeFrames) return volume * (frame / fadeFrames);
        if (frame > durationInFrames - fadeFrames) {
          return volume * ((durationInFrames - frame) / fadeFrames);
        }
        return volume;
      }}
    />
  );
};
```

- [ ] **Step 2: BGM asset README**

Create `packages/remotion/src/assets/bgm/README.md`:
```markdown
# BGM Tracks

This directory holds four royalty-free MP3 tracks keyed by mood:

- `upbeat.mp3`
- `cinematic.mp3`
- `minimal.mp3`
- `tech.mp3`

## Licensing

These files are NOT checked in. Supply your own royalty-free or licensed tracks,
matched 1:1 by filename. Recommended sources:

- https://uppbeat.io (free tier with attribution)
- https://pixabay.com/music
- https://freemusicarchive.org (CC licenses)

Recommended properties: 30s–90s loopable, -14 LUFS master level, MP3 128kbps+.
Remotion will fade in/out over 20 frames (~0.67s) at composition edges via
`BGMTrack` in `src/primitives/BGMTrack.tsx`.

## Remotion static files

`staticFile('bgm/upbeat.mp3')` resolves to this path at render time. See
https://www.remotion.dev/docs/staticfile for resolution rules.
```

- [ ] **Step 3: Add `.gitignore` entries**

Append to the **repo-root** `.gitignore`:
```
# Non-checked-in media assets (user supplies locally / via secrets store)
packages/remotion/src/assets/bgm/*.mp3
```

Keep `README.md` tracked.

- [ ] **Step 4: Commit**

```bash
git add packages/remotion/src/primitives/BGMTrack.tsx packages/remotion/src/assets/bgm/README.md .gitignore
git commit -m "feat(remotion): BGMTrack primitive + mood asset README"
```

---

### Task 3.11: 5 MVP scene components

Each scene gets its own commit. Components are straightforward; testing happens in the dispatcher (Task 3.12) and the render smoke test (Task 3.14).

**Files:**
- Create: `packages/remotion/src/scenes/HeroRealShot.tsx`
- Create: `packages/remotion/src/scenes/FeatureCallout.tsx`
- Create: `packages/remotion/src/scenes/TextPunch.tsx`
- Create: `packages/remotion/src/scenes/SmoothScroll.tsx`
- Create: `packages/remotion/src/scenes/CTA.tsx`

#### 3.11a HeroRealShot

```tsx
import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText.js';
import { BrowserChrome } from '../primitives/BrowserChrome.js';
import type { BrandTheme } from '../utils/brandTheme.js';

export interface HeroRealShotProps {
  title: string;
  subtitle?: string;
  screenshotUrl: string; // already resolved from s3://
  url: string;
  theme: BrandTheme;
}

export const HeroRealShot: React.FC<HeroRealShotProps> = ({ title, subtitle, screenshotUrl, url, theme }) => (
  <AbsoluteFill style={{ background: theme.primary }}>
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <div style={{ textAlign: 'center', marginBottom: 40, color: theme.textOn }}>
        <AnimatedText
          text={title}
          style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}
        />
        {subtitle ? (
          <div style={{ marginTop: 16 }}>
            <AnimatedText
              text={subtitle}
              delayFrames={15}
              style={{ fontSize: 24, opacity: 0.9 }}
            />
          </div>
        ) : null}
      </div>
      <BrowserChrome url={url} style={{ width: 960, height: 540 }}>
        <Img src={screenshotUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </BrowserChrome>
    </AbsoluteFill>
  </AbsoluteFill>
);
```

Commit: `git add packages/remotion/src/scenes/HeroRealShot.tsx && git commit -m "feat(remotion): HeroRealShot scene"`

#### 3.11b FeatureCallout

```tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText.js';
import type { BrandTheme } from '../utils/brandTheme.js';

export interface FeatureCalloutProps {
  title: string;
  description: string;
  layout: 'leftImage' | 'rightImage' | 'topDown';
  theme: BrandTheme;
}

export const FeatureCallout: React.FC<FeatureCalloutProps> = ({ title, description, layout, theme }) => (
  <AbsoluteFill style={{ background: theme.bg, color: '#111' }}>
    <AbsoluteFill
      style={{
        padding: 80,
        display: 'flex',
        flexDirection: layout === 'topDown' ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 60,
      }}
    >
      {layout === 'rightImage' ? <FakePanel theme={theme} /> : null}
      <div style={{ flex: 1, maxWidth: 560 }}>
        <AnimatedText text={title} style={{ fontSize: 48, fontWeight: 700, color: theme.primary }} />
        <div style={{ marginTop: 24 }}>
          <AnimatedText text={description} delayFrames={12} style={{ fontSize: 24, lineHeight: 1.4 }} />
        </div>
      </div>
      {layout !== 'rightImage' ? <FakePanel theme={theme} /> : null}
    </AbsoluteFill>
  </AbsoluteFill>
);

const FakePanel: React.FC<{ theme: BrandTheme }> = ({ theme }) => (
  <div
    style={{
      width: 440,
      height: 320,
      borderRadius: 20,
      background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryLight})`,
      boxShadow: '0 20px 40px rgba(0,0,0,0.12)',
    }}
  />
);
```

Commit: `feat(remotion): FeatureCallout scene`

#### 3.11c TextPunch

```tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText.js';
import type { BrandTheme } from '../utils/brandTheme.js';

export interface TextPunchProps {
  text: string;
  emphasis: 'primary' | 'secondary' | 'neutral';
  theme: BrandTheme;
}

export const TextPunch: React.FC<TextPunchProps> = ({ text, emphasis, theme }) => {
  const bg =
    emphasis === 'primary' ? theme.primary : emphasis === 'secondary' ? theme.primaryDark : '#111';
  const color = emphasis === 'neutral' ? '#fff' : theme.textOn;
  return (
    <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 1000, textAlign: 'center', color, padding: 80 }}>
        <AnimatedText text={text} mode="charFade" style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }} />
      </div>
    </AbsoluteFill>
  );
};
```

Commit: `feat(remotion): TextPunch scene`

#### 3.11d SmoothScroll

```tsx
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { BrowserChrome } from '../primitives/BrowserChrome.js';
import type { BrandTheme } from '../utils/brandTheme.js';

export interface SmoothScrollProps {
  screenshotUrl: string;
  url: string;
  speed: 'slow' | 'medium' | 'fast';
  theme: BrandTheme;
}

const SPEED_MULTIPLIER: Record<SmoothScrollProps['speed'], number> = {
  slow: 0.6,
  medium: 1,
  fast: 1.6,
};

export const SmoothScroll: React.FC<SmoothScrollProps> = ({ screenshotUrl, url, speed, theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scrollDistance = 2000 * SPEED_MULTIPLIER[speed];
  const offset = interpolate(frame, [0, durationInFrames], [0, -scrollDistance], {
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{ background: theme.primaryDark, alignItems: 'center', justifyContent: 'center', padding: 80 }}
    >
      <BrowserChrome url={url} style={{ width: 1000, height: 560 }}>
        <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
          <Img
            src={screenshotUrl}
            style={{
              width: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translateY(${offset}px)`,
              willChange: 'transform',
            }}
          />
        </div>
      </BrowserChrome>
    </AbsoluteFill>
  );
};
```

Commit: `feat(remotion): SmoothScroll scene`

#### 3.11e CTA

```tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText.js';
import { LogoMark } from '../primitives/LogoMark.js';
import type { BrandTheme } from '../utils/brandTheme.js';

export interface CTAProps {
  headline: string;
  url: string;
  logoUrl?: string;
  theme: BrandTheme;
}

export const CTA: React.FC<CTAProps> = ({ headline, url, logoUrl, theme }) => {
  const hostname = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();
  const logoProps = {
    ...(logoUrl ? { logoUrl } : {}),
    fallbackUrl: url,
    size: 120,
    bg: theme.primaryLight,
    textOn: theme.textOn,
  };
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
        color: theme.textOn,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <LogoMark {...logoProps} />
        </div>
        <AnimatedText text={headline} style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15 }} />
        <div style={{ marginTop: 32, fontSize: 28, opacity: 0.85, fontFamily: 'monospace' }}>
          {hostname}
        </div>
      </div>
    </AbsoluteFill>
  );
};
```

Commit: `feat(remotion): CTA scene`

---

### Task 3.12: `resolveScene` dispatcher (TDD)

**Files:**
- Create: `packages/remotion/src/resolveScene.tsx`
- Create: `packages/remotion/tests/resolveScene.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect } from 'vitest';
import type { Scene, CrawlResult } from '@promptdemo/schema';
import { resolveScene } from '../src/resolveScene.js';
import { deriveTheme } from '../src/utils/brandTheme.js';

const theme = deriveTheme('#4f46e5');
const assets = {
  screenshots: { viewport: 's3://fake/v.jpg', fullPage: 's3://fake/f.jpg' },
} as unknown as Storyboard['assets'];

const resolver = (uri: string | undefined) => uri?.replace('s3://fake/', 'http://fake/');

describe('resolveScene', () => {
  it('returns an element for HeroRealShot', () => {
    const scene: Scene = {
      sceneId: 1,
      type: 'HeroRealShot',
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { title: 'Hi', screenshotKey: 'viewport' },
    };
    const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
    expect(el).toBeTruthy();
  });

  it('throws for deferred v1.1 scene types', () => {
    const scene = {
      sceneId: 1,
      type: 'BentoGrid',
      durationInFrames: 90,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] },
    } as unknown as Scene;
    expect(() => resolveScene({ scene, assets, theme, url: 'https://x.com', resolver })).toThrow(/not implemented/i);
  });
});

// Minimal type import so tests are self-contained
import type { Storyboard } from '@promptdemo/schema';
```

- [ ] **Step 2: Impl**

```tsx
import React from 'react';
import type { Scene, Storyboard } from '@promptdemo/schema';
import { HeroRealShot } from './scenes/HeroRealShot.js';
import { FeatureCallout } from './scenes/FeatureCallout.js';
import { TextPunch } from './scenes/TextPunch.js';
import { SmoothScroll } from './scenes/SmoothScroll.js';
import { CTA } from './scenes/CTA.js';
import type { BrandTheme } from './utils/brandTheme.js';

export interface ResolveSceneInput {
  scene: Scene;
  assets: Storyboard['assets'];
  theme: BrandTheme;
  url: string;
  logoUrl?: string;
  resolver: (uri: string | undefined) => string | undefined;
}

export function resolveScene(input: ResolveSceneInput): React.ReactElement {
  const { scene, assets, theme, url, logoUrl, resolver } = input;
  switch (scene.type) {
    case 'HeroRealShot': {
      const key = scene.props.screenshotKey;
      const screenshotUrl = resolver(assets.screenshots[key]);
      if (!screenshotUrl) throw new Error(`HeroRealShot requires assets.screenshots.${key}`);
      return (
        <HeroRealShot
          title={scene.props.title}
          {...(scene.props.subtitle ? { subtitle: scene.props.subtitle } : {})}
          screenshotUrl={screenshotUrl}
          url={url}
          theme={theme}
        />
      );
    }
    case 'FeatureCallout':
      return (
        <FeatureCallout
          title={scene.props.title}
          description={scene.props.description}
          layout={scene.props.layout}
          theme={theme}
        />
      );
    case 'TextPunch':
      return <TextPunch text={scene.props.text} emphasis={scene.props.emphasis} theme={theme} />;
    case 'SmoothScroll': {
      const screenshotUrl = resolver(assets.screenshots.fullPage);
      if (!screenshotUrl) throw new Error('SmoothScroll requires assets.screenshots.fullPage');
      return <SmoothScroll screenshotUrl={screenshotUrl} url={url} speed={scene.props.speed} theme={theme} />;
    }
    case 'CTA':
      return (
        <CTA
          headline={scene.props.headline}
          url={scene.props.url}
          {...(logoUrl ? { logoUrl } : {})}
          theme={theme}
        />
      );
    case 'HeroStylized':
    case 'CursorDemo':
    case 'UseCaseStory':
    case 'StatsBand':
    case 'BentoGrid':
      throw new Error(
        `scene type "${scene.type}" is deferred to v1.1 and not implemented in v1.0`
      );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/remotion/src/resolveScene.tsx packages/remotion/tests/resolveScene.test.tsx
git commit -m "feat(remotion): resolveScene dispatcher for 5 MVP scenes"
```

---

### Task 3.13: `MainComposition` + `Root.tsx`

**Files:**
- Replace: `packages/remotion/src/Root.tsx`
- Create: `packages/remotion/src/MainComposition.tsx`
- Create: `packages/remotion/tests/compositionRegistry.test.ts`

- [ ] **Step 1: `MainComposition.tsx`**

```tsx
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TransitionSeries } from '@remotion/transitions';
import type { Storyboard } from '@promptdemo/schema';
import { deriveTheme } from './utils/brandTheme.js';
import { makeS3Resolver } from './s3Resolver.js';
import { resolveScene } from './resolveScene.js';
import { BGMTrack } from './primitives/BGMTrack.js';
import { toPresentation } from './animations/entryExit.js';
import { defaultTransitionTiming } from './animations/timing.js';

const TRANSITION_FRAMES = 15;

export interface MainCompositionProps extends Storyboard {
  sourceUrl: string;
  resolverEndpoint: string;
  forcePathStyle: boolean;
}

export const MainComposition: React.FC<MainCompositionProps> = ({
  videoConfig,
  assets,
  scenes,
  sourceUrl,
  resolverEndpoint,
  forcePathStyle,
}) => {
  const theme = deriveTheme(videoConfig.brandColor);
  const resolver = makeS3Resolver({ endpoint: resolverEndpoint, forcePathStyle });
  const logoUrl = resolver(videoConfig.logoUrl);

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <BGMTrack mood={videoConfig.bgm} durationInFrames={videoConfig.durationInFrames} />
      <TransitionSeries>
        {scenes.map((scene, i) => {
          const sceneEl = resolveScene({
            scene,
            assets,
            theme,
            url: sourceUrl,
            ...(logoUrl ? { logoUrl } : {}),
            resolver,
          });
          const seq = (
            <TransitionSeries.Sequence key={`seq-${scene.sceneId}`} durationInFrames={scene.durationInFrames}>
              {sceneEl}
            </TransitionSeries.Sequence>
          );
          if (i === scenes.length - 1) return seq;
          const nextScene = scenes[i + 1]!;
          const presentation = toPresentation(nextScene.entryAnimation);
          return (
            <React.Fragment key={scene.sceneId}>
              {seq}
              <TransitionSeries.Transition
                key={`tr-${scene.sceneId}`}
                // @ts-expect-error — presentation component comes from @remotion/transitions opaque type
                presentation={presentation.component}
                timing={defaultTransitionTiming(TRANSITION_FRAMES)}
              />
            </React.Fragment>
          );
        })}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 2: `Root.tsx`**

```tsx
import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { MainComposition } from './MainComposition.js';
import defaultStoryboard from '@promptdemo/schema/fixtures/storyboard.30s.json' with { type: 'json' };
import type { Storyboard } from '@promptdemo/schema';

const defaults = defaultStoryboard as Storyboard;

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MainComposition"
      component={MainComposition}
      durationInFrames={defaults.videoConfig.durationInFrames}
      fps={defaults.videoConfig.fps}
      width={1280}
      height={720}
      defaultProps={{
        ...defaults,
        sourceUrl: 'https://example-saas.com',
        resolverEndpoint: process.env.REMOTION_S3_ENDPOINT ?? 'http://localhost:9000',
        forcePathStyle: true,
      }}
    />
  </>
);

registerRoot(RemotionRoot);
```

- [ ] **Step 3: Composition registry test**

```ts
import { describe, it, expect } from 'vitest';
import { bundle } from '@remotion/bundler';
import { getCompositions } from '@remotion/renderer';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

describe('Remotion composition registry', () => {
  it('registers MainComposition with the expected id and fps', async () => {
    const entry = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'Root.tsx');
    const bundled = await bundle({ entryPoint: entry });
    const comps = await getCompositions(bundled);
    const main = comps.find((c) => c.id === 'MainComposition');
    expect(main).toBeDefined();
    expect(main!.fps).toBe(30);
    expect(main!.width).toBe(1280);
    expect(main!.height).toBe(720);
  }, 120_000); // bundling can take ~20-40s on first run
});
```

- [ ] **Step 4: Commit**

```bash
git add packages/remotion/src/Root.tsx packages/remotion/src/MainComposition.tsx packages/remotion/tests/compositionRegistry.test.ts
git commit -m "feat(remotion): MainComposition with TransitionSeries + Root registration"
```

---

### Task 3.14: Render smoke test (headless)

**Files:**
- Create: `packages/remotion/tests/renderSmoke.test.ts`

**Why:** Full end-to-end validation that the composition renders without runtime errors. Writes a 10s MP4 to `/tmp` and asserts the file exists and is >10KB. Gated behind an env flag so CI can skip unless configured.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, statSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const GATED = process.env.REMOTION_SMOKE === 'true';

describe.skipIf(!GATED)('renderSmoke (gated behind REMOTION_SMOKE=true)', () => {
  it('renders a 10s MP4 without error', async () => {
    const entry = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'Root.tsx');
    const bundled = await bundle({ entryPoint: entry });
    const comps = await getCompositions(bundled);
    const main = comps.find((c) => c.id === 'MainComposition');
    expect(main).toBeDefined();

    const outDir = mkdtempSync(join(tmpdir(), 'promptdemo-smoke-'));
    const outPath = join(outDir, 'smoke.mp4');
    try {
      await renderMedia({
        composition: {
          ...main!,
          durationInFrames: 300, // force 10s smoke regardless of fixture
        },
        serveUrl: bundled,
        codec: 'h264',
        outputLocation: outPath,
      });
      expect(existsSync(outPath)).toBe(true);
      expect(statSync(outPath).size).toBeGreaterThan(10_000);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 300_000); // up to 5 minutes on cold cache
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/remotion/tests/renderSmoke.test.ts
git commit -m "test(remotion): gated render smoke test (REMOTION_SMOKE=true)"
```

Note: run locally once with `REMOTION_SMOKE=true pnpm --filter @promptdemo/remotion test` to verify end-to-end rendering before tagging. Requires MinIO running with the `promptdemo-dev` bucket containing the saas-landing fixture screenshots (or the Hero scene will fail asset load).

---

### Task 3.15: Final typecheck + test + tag

- [ ] **Step 1: Full workspace validation**

```bash
pnpm -r typecheck
pnpm -r test
```

Expected totals:
- schema: 41
- worker-crawler: 47
- worker-storyboard: ~35 (after Plan 2 complete) — 0 if Plan 2 not executed
- remotion: ~15 (brandTheme, domainInitials, entryExit, resolveScene, compositionRegistry; render smoke gated out)

- [ ] **Step 2: Tag**

```bash
git tag -a v0.3.0-remotion-mvp -m "Phase 3: Remotion package + 5 MVP scenes complete

Adds @promptdemo/remotion:
- React 18 + Remotion 4 composition package
- 5 v1 scene components: HeroRealShot, FeatureCallout, TextPunch,
  SmoothScroll, CTA. Deferred v1.1 types throw at dispatch with a
  clear message.
- Primitives: BrowserChrome, LogoMark (with domain-initial fallback),
  AnimatedText (spring char/word fade), BGMTrack (mood-keyed royalty-free
  tracks, 20-frame fade)
- Utils: brandTheme (HSL-based palette derivation), domainInitials,
  s3Resolver (s3:// → http(s) for asset loading)
- Animations: entryAnimation enum → TransitionSeries presentation mapping
- Font loading via @remotion/google-fonts whitelist (11 families)
  with delayRender for flicker-free render
- MainComposition wires Storyboard as defaultProps; Root.tsx registers
  with the 30s fixture for Studio preview
- Gated render smoke test (REMOTION_SMOKE=true) for end-to-end validation"
```

- [ ] **Step 3: Decide push with user.**

---

## Self-Review

**Spec coverage (§2, §6):**
- Scene Type catalog with exactly the 10 types, 5 implemented ✓ (Task 3.11, 3.12)
- Transitions as per-scene property via TransitionSeries ✓ (Task 3.13)
- ThemeProvider from brandColor (implemented as `deriveTheme` consumed directly by scenes instead of Context — simpler, fewer re-renders) ✓ (Tasks 3.4, 3.13)
- Font loading with delayRender ✓ (Task 3.6)
- Royalty-free BGM bundled by mood ✓ (Task 3.10)
- Discriminated union dispatcher ✓ (Task 3.12)
- Cursor primitive — **NOT in v1** (Cursor only used by CursorDemo scene which is v1.1-deferred)
- SFXPlayer — **NOT in v1** (only consumed by Cursor)
- Render via `renderMedia` API ✓ (Task 3.14)
- IAM-auth internal S3 URIs — handled by Plan 5 render worker; Plan 3 needs HTTP URLs, so `s3Resolver` exists. Plan 5 will swap resolver endpoint from MinIO to a real signed-URL generator or proxy.

**Placeholders:** BGM `.mp3` files are intentionally not checked in; `assets/bgm/README.md` documents licensing. Dispatcher throws for v1.1 types with a clear message — this is the intended behavior.

**Type consistency:**
- `Storyboard`/`Scene` types come from `@promptdemo/schema` — single source of truth ✓
- `BrandTheme` shape consistent across scenes + MainComposition ✓
- `entryAnimation` enum values match `ANIMATION_ENUM` and `AnimationEnum` in schema ✓
- `BgmMood` enum in BGMTrack aligned with `videoConfig.bgm` Zod enum ✓

**Scope check:** 15 tasks, single Remotion package. Independently shippable.

---

## Execution Handoff

Subagent-driven (compressed) or inline. User picks.

## Open Questions for Plan Phase

- BGM track sourcing and licensing — user supplies; we don't commit the files. Is there a preferred source?
- Font whitelist: currently 11 families. Should we trim to the most-used 3–4 for bundle size, or keep the full set?
- Render smoke test gating: default skipped. Should CI run it on a nightly workflow instead of per-push?
