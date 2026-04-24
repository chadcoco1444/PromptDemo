# PromptDemo v1.0 — Plan 1: Foundation + Crawler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the pnpm monorepo, ship the shared Zod schema with fixtures, and deliver a three-track crawler worker that produces valid `CrawlResult` artifacts to S3.

**Architecture:** pnpm workspaces monorepo. `packages/schema` is the source of truth for all cross-boundary types (CrawlResult, Storyboard, normalization). `workers/crawler` is a self-contained BullMQ worker that wraps Playwright → ScreenshotOne → Cheerio with strict fallback tiers and publishes artifacts to S3 (MinIO in dev).

**Tech Stack:** TypeScript, Zod, pnpm workspaces, Vitest, Playwright, Cheerio, `fast-average-color-node`, BullMQ, ioredis, MinIO (local), Docker + tini.

**Spec reference:** `docs/superpowers/specs/2026-04-20-promptdemo-design.md` §1, §4.

**Future plans (not in this doc):**
- Plan 2 — Storyboard AI worker (Claude + Zod + extractive validation)
- Plan 3 — Remotion package + 5 MVP scene components
- Plan 4 — API gateway (Fastify + SSE + rate limit + global backpressure)
- Plan 5 — Render worker (Remotion renderMedia + S3 + concurrency=1)
- Plan 6 — Next.js frontend
- Plan 7 — Docker images + Cloud Run deploy + IAM

---

## File Structure (Plans 1 target)

```
promptdemo/
├── .gitignore
├── .nvmrc
├── package.json                      # root, workspaces config
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── docker-compose.dev.yaml           # redis + minio for local dev
│
├── packages/
│   └── schema/
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts              # public exports
│       │   ├── normalizeText.ts      # shared text normalization
│       │   ├── crawlResult.ts        # Zod schema + types
│       │   ├── storyboard.ts         # Zod schema + types (10 types reserved; 5 used v1)
│       │   └── s3Uri.ts              # s3:// URI brand type + helpers
│       ├── fixtures/
│       │   ├── crawlResult.saas-landing.json
│       │   ├── crawlResult.ecommerce.json
│       │   ├── crawlResult.docs.json
│       │   ├── storyboard.10s.json
│       │   ├── storyboard.30s.json
│       │   ├── storyboard.60s.json
│       │   └── storyboard.tierB-fallback.json
│       └── tests/
│           ├── normalizeText.test.ts
│           ├── crawlResult.test.ts
│           └── storyboard.test.ts
│
└── workers/
    └── crawler/
        ├── package.json
        ├── tsconfig.json
        ├── Dockerfile
        ├── src/
        │   ├── index.ts              # BullMQ worker bootstrap
        │   ├── orchestrator.ts       # three-track coordination
        │   ├── tracks/
        │   │   ├── playwrightTrack.ts
        │   │   ├── screenshotOneTrack.ts
        │   │   └── cheerioTrack.ts
        │   ├── extractors/
        │   │   ├── colorSampler.ts
        │   │   ├── logoDetector.ts
        │   │   ├── textExtractor.ts
        │   │   ├── featureExtractor.ts
        │   │   └── fontDetector.ts
        │   ├── s3/
        │   │   └── s3Client.ts
        │   ├── wafDetect.ts          # Cloudflare / bot challenge detection
        │   └── cookieBanner.ts       # selector list + dismissal
        └── tests/
            ├── orchestrator.test.ts
            ├── colorSampler.test.ts
            ├── logoDetector.test.ts
            ├── textExtractor.test.ts
            ├── featureExtractor.test.ts
            ├── wafDetect.test.ts
            └── cookieBanner.test.ts
```

---

## Phase 0 — Foundation

### Task 0.1: Initialize git repo + root tooling

**Files:**
- Create: `.gitignore`
- Create: `.nvmrc`
- Create: `README.md`

- [ ] **Step 1: Initialize repo and base files**

Run:
```bash
cd "c:/Users/88698/Desktop/Workspace/promptdemo"
git init
git branch -M main
git remote add origin https://github.com/chadcoco1444/PromptDemo.git
```

Write `.nvmrc`:
```
20.11.1
```

Write `.gitignore`:
```
node_modules
dist
build
.next
out
coverage
.env
.env.local
*.log
.DS_Store
pnpm-lock.yaml
!/pnpm-lock.yaml
.turbo
.vitest-cache
playwright/.cache
# keep workspace file
!promptdemo.code-workspace
# render artifacts
/tmp
/out-videos
```

Write a minimal `README.md`:
```markdown
# PromptDemo

Automated website demo video generator. URL + intent → MP4.

See `docs/superpowers/specs/` for the design spec and `docs/superpowers/plans/` for implementation plans.
```

- [ ] **Step 2: Commit**

```bash
git add .nvmrc .gitignore README.md promptdemo.code-workspace
git commit -m "chore: initialize repo scaffolding"
```

---

### Task 0.2: pnpm workspace config + root package.json

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
  - 'workers/*'
```

- [ ] **Step 2: Write root `package.json`**

```json
{
  "name": "promptdemo",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20.11.0"
  },
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r run typecheck",
    "lint": "pnpm -r run lint",
    "infra:up": "docker compose -f docker-compose.dev.yaml up -d",
    "infra:down": "docker compose -f docker-compose.dev.yaml down",
    "infra:check": "node scripts/infra-check.mjs"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "vitest": "2.1.1",
    "@types/node": "20.14.10"
  }
}
```

- [ ] **Step 3: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "composite": false
  }
}
```

- [ ] **Step 4: Install root deps and verify pnpm**

Run:
```bash
pnpm install
```

Expected: creates `pnpm-lock.yaml`, installs TypeScript + Vitest in root devDependencies.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json pnpm-lock.yaml
git commit -m "chore: add pnpm workspace config and root toolchain"
```

---

### Task 0.3: Scaffold `packages/schema`

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/src/index.ts`

- [ ] **Step 1: Write `packages/schema/package.json`**

```json
{
  "name": "@promptdemo/schema",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./fixtures/*": "./fixtures/*"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "build": "echo 'no build step (consumed as TS source)'"
  },
  "dependencies": {
    "zod": "3.23.8"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "vitest": "2.1.1"
  }
}
```

- [ ] **Step 2: Write `packages/schema/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write empty `packages/schema/src/index.ts`**

```ts
// Public API of @promptdemo/schema. Re-exports added per task.
export {};
```

- [ ] **Step 4: Install workspace deps**

Run:
```bash
pnpm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/schema/package.json packages/schema/tsconfig.json packages/schema/src/index.ts pnpm-lock.yaml
git commit -m "chore(schema): scaffold @promptdemo/schema package"
```

---

### Task 0.4: `normalizeText` utility (TDD)

**Files:**
- Create: `packages/schema/src/normalizeText.ts`
- Create: `packages/schema/tests/normalizeText.test.ts`

**Why:** Both crawler and storyboard validator must normalize text identically, so Fuse.js doesn't reject clean AI output because the source pool contained zero-width characters or entity-encoded punctuation. See spec §4 and §5.

- [ ] **Step 1: Write the failing tests**

Create `packages/schema/tests/normalizeText.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeText } from '../src/normalizeText.js';

describe('normalizeText', () => {
  it('decodes HTML entities', () => {
    expect(normalizeText('Build &amp; ship')).toBe('build & ship');
  });

  it('collapses whitespace including tabs and newlines', () => {
    expect(normalizeText('  multi\t\n  spaced   ')).toBe('multi spaced');
  });

  it('strips zero-width and BOM characters', () => {
    expect(normalizeText('hel\u200Blo\uFEFF')).toBe('hello');
  });

  it('lowercases ASCII', () => {
    expect(normalizeText('HELLO World')).toBe('hello world');
  });

  it('applies NFKC normalization for unicode', () => {
    // fullwidth 'Ａ' NFKC normalizes to 'A'
    expect(normalizeText('Ａbc')).toBe('abc');
  });

  it('preserves CJK characters as-is (no lowering) and trims edges', () => {
    expect(normalizeText('自動化')).toBe('自動化');
    expect(normalizeText('  未來  ')).toBe('未來');
  });

  it('removes whitespace between adjacent CJK characters (no word boundaries in CJK)', () => {
    // Essential for downstream Fuse.js / N-gram matching. Mixed CJK+Latin retains the boundary space.
    expect(normalizeText('自  動 化')).toBe('自動化');
    expect(normalizeText('ai 自動化 ship')).toBe('ai 自動化 ship');
  });

  it('converts fullwidth space to removed when between CJK chars', () => {
    expect(normalizeText('自\u3000動化')).toBe('自動化');
  });

  it('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  it('strips control chars but keeps printable punctuation', () => {
    expect(normalizeText('hello\u0001, world!')).toBe('hello, world!');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm --filter @promptdemo/schema test
```

Expected: FAIL — `Cannot find module '../src/normalizeText.js'`.

- [ ] **Step 3: Implement `normalizeText`**

Create `packages/schema/src/normalizeText.ts`:
```ts
const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      const cp = parseInt(code.slice(2), 16);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    if (code.startsWith('#')) {
      const cp = parseInt(code.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : match;
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? match;
  });
}

const ZERO_WIDTH_OR_BOM = /[\u200B-\u200D\uFEFF]/g;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;
const WHITESPACE = /\s+/g;

// Unified CJK range: CJK Unified Ideographs + Hiragana + Katakana + Hangul Syllables + common compat.
const CJK_CHAR = '[\\u3040-\\u30FF\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uAC00-\\uD7AF\\uF900-\\uFAFF]';
// Whitespace (ASCII or ideographic \u3000) between two CJK chars — drop it (no word boundaries in CJK).
const WS_BETWEEN_CJK = new RegExp(`(${CJK_CHAR})[\\s\\u3000]+(${CJK_CHAR})`, 'g');

export function normalizeText(input: string): string {
  if (!input) return '';
  let out = input;
  out = decodeEntities(out);
  out = out.normalize('NFKC');
  out = out.replace(ZERO_WIDTH_OR_BOM, '');
  out = out.replace(CONTROL_CHARS, '');
  out = out.replace(WHITESPACE, ' ').trim();
  out = out.toLowerCase();
  // Tighten CJK: drop any whitespace between adjacent CJK chars. Run twice to catch overlapping matches.
  out = out.replace(WS_BETWEEN_CJK, '$1$2').replace(WS_BETWEEN_CJK, '$1$2');
  return out;
}
```

- [ ] **Step 4: Re-export from `index.ts`**

Edit `packages/schema/src/index.ts`:
```ts
export { normalizeText } from './normalizeText.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run:
```bash
pnpm --filter @promptdemo/schema test
```

Expected: PASS — 8 tests green.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/normalizeText.ts packages/schema/src/index.ts packages/schema/tests/normalizeText.test.ts
git commit -m "feat(schema): add normalizeText shared utility"
```

---

### Task 0.5: `s3Uri` brand type (TDD)

**Files:**
- Create: `packages/schema/src/s3Uri.ts`
- Create: `packages/schema/tests/s3Uri.test.ts`

**Why:** Spec §1, §4 mandate inter-stage artifacts use `s3://bucket/key` URIs rather than pre-signed HTTPS URLs. A brand type prevents accidental string mix-ups.

- [ ] **Step 1: Write failing tests**

Create `packages/schema/tests/s3Uri.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { S3UriSchema, parseS3Uri, toS3Uri } from '../src/s3Uri.js';

describe('S3UriSchema', () => {
  it('accepts valid s3 URI', () => {
    expect(S3UriSchema.parse('s3://my-bucket/key/path.jpg')).toBe('s3://my-bucket/key/path.jpg');
  });

  it('rejects http URLs', () => {
    expect(() => S3UriSchema.parse('https://x.s3.amazonaws.com/k')).toThrow();
  });

  it('rejects missing bucket', () => {
    expect(() => S3UriSchema.parse('s3:///key')).toThrow();
  });

  it('rejects missing key', () => {
    expect(() => S3UriSchema.parse('s3://bucket')).toThrow();
  });
});

describe('parseS3Uri', () => {
  it('splits bucket and key', () => {
    expect(parseS3Uri('s3://my-bucket/a/b/c.jpg')).toEqual({ bucket: 'my-bucket', key: 'a/b/c.jpg' });
  });
});

describe('toS3Uri', () => {
  it('assembles bucket and key', () => {
    expect(toS3Uri('bucket', 'a/b.jpg')).toBe('s3://bucket/a/b.jpg');
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run:
```bash
pnpm --filter @promptdemo/schema test -- s3Uri
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/schema/src/s3Uri.ts`:
```ts
import { z } from 'zod';

export const S3UriSchema = z
  .string()
  .refine((v) => /^s3:\/\/[^/]+\/.+/.test(v), {
    message: 'must be s3://<bucket>/<key>',
  })
  .brand<'S3Uri'>();

export type S3Uri = z.infer<typeof S3UriSchema>;

export function parseS3Uri(uri: string): { bucket: string; key: string } {
  const parsed = S3UriSchema.parse(uri);
  const rest = (parsed as unknown as string).slice('s3://'.length);
  const idx = rest.indexOf('/');
  return { bucket: rest.slice(0, idx), key: rest.slice(idx + 1) };
}

export function toS3Uri(bucket: string, key: string): S3Uri {
  return S3UriSchema.parse(`s3://${bucket}/${key}`) as S3Uri;
}
```

- [ ] **Step 4: Re-export**

Edit `packages/schema/src/index.ts`:
```ts
export { normalizeText } from './normalizeText.js';
export { S3UriSchema, parseS3Uri, toS3Uri, type S3Uri } from './s3Uri.js';
```

- [ ] **Step 5: Run tests**

Run:
```bash
pnpm --filter @promptdemo/schema test
```

Expected: PASS — all (8 + 6) tests.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/s3Uri.ts packages/schema/src/index.ts packages/schema/tests/s3Uri.test.ts
git commit -m "feat(schema): add S3Uri brand type"
```

---

### Task 0.6: `CrawlResult` Zod schema (TDD)

**Files:**
- Create: `packages/schema/src/crawlResult.ts`
- Create: `packages/schema/tests/crawlResult.test.ts`

**Why:** Contract between crawler worker and storyboard worker. Must exactly match spec §4.

- [ ] **Step 1: Write failing tests**

Create `packages/schema/tests/crawlResult.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { CrawlResultSchema } from '../src/crawlResult.js';

const baseValid = {
  url: 'https://example.com',
  fetchedAt: 1_700_000_000_000,
  screenshots: {},
  brand: {},
  sourceTexts: ['hello world'],
  features: [],
  fallbacks: [],
  tier: 'B' as const,
  trackUsed: 'playwright' as const,
};

describe('CrawlResultSchema', () => {
  it('accepts a minimal Tier-B result', () => {
    const parsed = CrawlResultSchema.parse(baseValid);
    expect(parsed.tier).toBe('B');
  });

  it('accepts optional screenshots as s3 URIs', () => {
    const parsed = CrawlResultSchema.parse({
      ...baseValid,
      screenshots: {
        viewport: 's3://bucket/viewport.jpg',
        fullPage: 's3://bucket/full.jpg',
      },
    });
    expect(parsed.screenshots.viewport).toBe('s3://bucket/viewport.jpg');
  });

  it('rejects non-s3 screenshot URLs', () => {
    expect(() =>
      CrawlResultSchema.parse({
        ...baseValid,
        screenshots: { viewport: 'https://x/y.jpg' },
      })
    ).toThrow();
  });

  it('rejects unknown tier values', () => {
    expect(() => CrawlResultSchema.parse({ ...baseValid, tier: 'D' })).toThrow();
  });

  it('rejects unknown trackUsed values', () => {
    expect(() => CrawlResultSchema.parse({ ...baseValid, trackUsed: 'selenium' })).toThrow();
  });

  it('rejects non-hex primaryColor', () => {
    expect(() =>
      CrawlResultSchema.parse({
        ...baseValid,
        brand: { primaryColor: 'not-a-color' },
      })
    ).toThrow();
  });

  it('accepts valid 7-char hex color', () => {
    const parsed = CrawlResultSchema.parse({
      ...baseValid,
      brand: { primaryColor: '#1a2b3c' },
    });
    expect(parsed.brand.primaryColor).toBe('#1a2b3c');
  });

  it('requires sourceTexts to be non-empty array of strings', () => {
    expect(() => CrawlResultSchema.parse({ ...baseValid, sourceTexts: [] })).toThrow();
  });

  it('limits sourceTexts entries to 200 chars', () => {
    const long = 'x'.repeat(201);
    expect(() => CrawlResultSchema.parse({ ...baseValid, sourceTexts: [long] })).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run:
```bash
pnpm --filter @promptdemo/schema test -- crawlResult
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `packages/schema/src/crawlResult.ts`:
```ts
import { z } from 'zod';
import { S3UriSchema } from './s3Uri.js';

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be #RRGGBB hex');

const BrandSchema = z.object({
  primaryColor: HexColorSchema.optional(),
  secondaryColor: HexColorSchema.optional(),
  logoUrl: S3UriSchema.optional(),
  fontFamily: z.string().max(64).optional(),
  fontFamilySupported: z.boolean().optional(),
});

const ScreenshotsSchema = z.object({
  viewport: S3UriSchema.optional(),
  fullPage: S3UriSchema.optional(),
  byFeature: z.record(S3UriSchema).optional(),
});

const FeatureSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  iconHint: z.string().max(100).optional(),
});

const FallbackSchema = z.object({
  field: z.string(),
  reason: z.string(),
  replacedWith: z.string(),
});

export const CrawlResultSchema = z.object({
  url: z.string().url(),
  fetchedAt: z.number().int().positive(),
  screenshots: ScreenshotsSchema,
  brand: BrandSchema,
  sourceTexts: z.array(z.string().min(1).max(200)).min(1),
  features: z.array(FeatureSchema),
  fallbacks: z.array(FallbackSchema),
  tier: z.enum(['A', 'B', 'C']),
  trackUsed: z.enum(['playwright', 'screenshot-saas', 'cheerio']),
});

export type CrawlResult = z.infer<typeof CrawlResultSchema>;
```

- [ ] **Step 4: Re-export**

Edit `packages/schema/src/index.ts`:
```ts
export { normalizeText } from './normalizeText.js';
export { S3UriSchema, parseS3Uri, toS3Uri, type S3Uri } from './s3Uri.js';
export { CrawlResultSchema, type CrawlResult } from './crawlResult.js';
```

- [ ] **Step 5: Run tests**

Run:
```bash
pnpm --filter @promptdemo/schema test
```

Expected: PASS — all tests.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/crawlResult.ts packages/schema/src/index.ts packages/schema/tests/crawlResult.test.ts
git commit -m "feat(schema): add CrawlResult Zod schema"
```

---

### Task 0.7: `Storyboard` Zod schema (10 types reserved, 5 implemented in v1)

**Files:**
- Create: `packages/schema/src/storyboard.ts`
- Create: `packages/schema/tests/storyboard.test.ts`

**Why:** Contract between storyboard worker, renderer, and API. Forward-compatible with v1.1 scene types per spec "Deferred to Later Iterations".

- [ ] **Step 1: Write failing tests**

Create `packages/schema/tests/storyboard.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { StoryboardSchema } from '../src/storyboard.js';

const minimalValid = {
  videoConfig: {
    durationInFrames: 900,
    fps: 30 as const,
    brandColor: '#ff5500',
    bgm: 'upbeat' as const,
  },
  assets: {
    screenshots: {},
    sourceTexts: ['hello'],
  },
  scenes: [
    {
      sceneId: 1,
      type: 'TextPunch' as const,
      durationInFrames: 900,
      entryAnimation: 'fade' as const,
      exitAnimation: 'fade' as const,
      props: { text: 'hello', emphasis: 'primary' as const },
    },
  ],
};

describe('StoryboardSchema', () => {
  it('accepts minimal valid storyboard', () => {
    const parsed = StoryboardSchema.parse(minimalValid);
    expect(parsed.scenes.length).toBe(1);
  });

  it('rejects fps other than 30', () => {
    expect(() =>
      StoryboardSchema.parse({
        ...minimalValid,
        videoConfig: { ...minimalValid.videoConfig, fps: 24 },
      })
    ).toThrow();
  });

  it('rejects scenes whose durations do not sum to videoConfig.durationInFrames', () => {
    expect(() =>
      StoryboardSchema.parse({
        ...minimalValid,
        scenes: [{ ...minimalValid.scenes[0]!, durationInFrames: 800 }],
      })
    ).toThrow(/duration/i);
  });

  it('accepts all 10 scene types structurally', () => {
    const types = [
      'HeroRealShot',
      'HeroStylized',
      'FeatureCallout',
      'CursorDemo',
      'SmoothScroll',
      'UseCaseStory',
      'StatsBand',
      'BentoGrid',
      'TextPunch',
      'CTA',
    ] as const;
    for (const t of types) {
      expect(() =>
        StoryboardSchema.parse({
          ...minimalValid,
          scenes: [makeScene(t)],
        })
      ).not.toThrow();
    }
  });

  it('rejects unknown scene type', () => {
    expect(() =>
      StoryboardSchema.parse({
        ...minimalValid,
        scenes: [{ ...minimalValid.scenes[0]!, type: 'UnknownType' }],
      })
    ).toThrow();
  });

  it('requires entryAnimation and exitAnimation on every scene', () => {
    const bad = { ...minimalValid.scenes[0]! };
    // @ts-expect-error deliberately omitted
    delete bad.entryAnimation;
    expect(() => StoryboardSchema.parse({ ...minimalValid, scenes: [bad] })).toThrow();
  });

  it('accepts bgm value "none"', () => {
    const parsed = StoryboardSchema.parse({
      ...minimalValid,
      videoConfig: { ...minimalValid.videoConfig, bgm: 'none' },
    });
    expect(parsed.videoConfig.bgm).toBe('none');
  });
});

// helper: fabricate a minimal scene of any type that fills duration 900
function makeScene(type: string) {
  const base = {
    sceneId: 1,
    durationInFrames: 900,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
  };
  const propsByType: Record<string, object> = {
    HeroRealShot: { title: 'hi', subtitle: 'there', screenshotKey: 'viewport' },
    HeroStylized: { title: 'hi', subtitle: 'there' },
    FeatureCallout: { title: 'f', description: 'd', layout: 'leftImage' },
    CursorDemo: { action: 'Click', targetHint: { region: 'center' }, targetDescription: 'btn' },
    SmoothScroll: { screenshotKey: 'fullPage', speed: 'medium' },
    UseCaseStory: { beats: [{ label: 'before', text: 'x' }, { label: 'action', text: 'y' }, { label: 'after', text: 'z' }] },
    StatsBand: { stats: [{ value: '100', label: 'users' }] },
    BentoGrid: { items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }] },
    TextPunch: { text: 'hi', emphasis: 'primary' },
    CTA: { headline: 'Visit', url: 'https://x.com' },
  };
  return { ...base, type, props: propsByType[type]! };
}
```

- [ ] **Step 2: Run to verify fail**

Run:
```bash
pnpm --filter @promptdemo/schema test -- storyboard
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `packages/schema/src/storyboard.ts`:
```ts
import { z } from 'zod';
import { S3UriSchema } from './s3Uri.js';

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const AnimationEnum = z.enum([
  'fade',
  'slideLeft',
  'slideRight',
  'slideUp',
  'zoomIn',
  'zoomOut',
  'none',
]);

const BgmEnum = z.enum(['upbeat', 'cinematic', 'minimal', 'tech', 'none']);

const VideoConfigSchema = z.object({
  durationInFrames: z.number().int().positive(),
  fps: z.literal(30),
  brandColor: HexColorSchema,
  logoUrl: S3UriSchema.optional(),
  bgm: BgmEnum,
});

const AssetsSchema = z.object({
  screenshots: z.object({
    viewport: S3UriSchema.optional(),
    fullPage: S3UriSchema.optional(),
    byFeature: z.record(S3UriSchema).optional(),
  }),
  sourceTexts: z.array(z.string()).min(1),
});

const sceneBase = {
  sceneId: z.number().int().positive(),
  durationInFrames: z.number().int().positive(),
  entryAnimation: AnimationEnum,
  exitAnimation: AnimationEnum,
  locked: z.boolean().optional(),
};

const HeroRealShotSchema = z.object({
  ...sceneBase,
  type: z.literal('HeroRealShot'),
  props: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
    screenshotKey: z.enum(['viewport', 'fullPage']),
  }),
});

const HeroStylizedSchema = z.object({
  ...sceneBase,
  type: z.literal('HeroStylized'),
  props: z.object({
    title: z.string().min(1),
    subtitle: z.string().optional(),
  }),
});

const FeatureCalloutSchema = z.object({
  ...sceneBase,
  type: z.literal('FeatureCallout'),
  props: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    layout: z.enum(['leftImage', 'rightImage', 'topDown']),
    iconHint: z.string().optional(),
  }),
});

const CursorDemoSchema = z.object({
  ...sceneBase,
  type: z.literal('CursorDemo'),
  props: z.object({
    action: z.enum(['Click', 'Scroll', 'Hover', 'Type']),
    targetHint: z.object({
      region: z.enum(['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right']),
    }),
    targetDescription: z.string().min(1),
  }),
});

const SmoothScrollSchema = z.object({
  ...sceneBase,
  type: z.literal('SmoothScroll'),
  props: z.object({
    screenshotKey: z.literal('fullPage'),
    speed: z.enum(['slow', 'medium', 'fast']),
  }),
});

const UseCaseStorySchema = z.object({
  ...sceneBase,
  type: z.literal('UseCaseStory'),
  props: z.object({
    beats: z
      .array(z.object({ label: z.enum(['before', 'action', 'after']), text: z.string().min(1) }))
      .length(3),
  }),
});

const StatsBandSchema = z.object({
  ...sceneBase,
  type: z.literal('StatsBand'),
  props: z.object({
    stats: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).min(1).max(4),
  }),
});

const BentoGridSchema = z.object({
  ...sceneBase,
  type: z.literal('BentoGrid'),
  props: z.object({
    items: z
      .array(z.object({ title: z.string().min(1), description: z.string().optional(), iconHint: z.string().optional() }))
      .min(3)
      .max(6),
  }),
});

const TextPunchSchema = z.object({
  ...sceneBase,
  type: z.literal('TextPunch'),
  props: z.object({
    text: z.string().min(1),
    emphasis: z.enum(['primary', 'secondary', 'neutral']),
  }),
});

const CTASchema = z.object({
  ...sceneBase,
  type: z.literal('CTA'),
  props: z.object({
    headline: z.string().min(1),
    url: z.string().url(),
  }),
});

export const SceneSchema = z.discriminatedUnion('type', [
  HeroRealShotSchema,
  HeroStylizedSchema,
  FeatureCalloutSchema,
  CursorDemoSchema,
  SmoothScrollSchema,
  UseCaseStorySchema,
  StatsBandSchema,
  BentoGridSchema,
  TextPunchSchema,
  CTASchema,
]);

export const SCENE_TYPES = [
  'HeroRealShot',
  'HeroStylized',
  'FeatureCallout',
  'CursorDemo',
  'SmoothScroll',
  'UseCaseStory',
  'StatsBand',
  'BentoGrid',
  'TextPunch',
  'CTA',
] as const;

export const V1_MVP_SCENE_TYPES = ['HeroRealShot', 'FeatureCallout', 'TextPunch', 'SmoothScroll', 'CTA'] as const;

export const StoryboardSchema = z
  .object({
    videoConfig: VideoConfigSchema,
    assets: AssetsSchema,
    scenes: z.array(SceneSchema).min(1),
  })
  .superRefine((sb, ctx) => {
    const sum = sb.scenes.reduce((n, s) => n + s.durationInFrames, 0);
    if (sum !== sb.videoConfig.durationInFrames) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scenes'],
        message: `scenes durationInFrames sum (${sum}) must equal videoConfig.durationInFrames (${sb.videoConfig.durationInFrames})`,
      });
    }
  });

export type Scene = z.infer<typeof SceneSchema>;
export type Storyboard = z.infer<typeof StoryboardSchema>;
```

- [ ] **Step 4: Re-export**

Edit `packages/schema/src/index.ts`:
```ts
export { normalizeText } from './normalizeText.js';
export { S3UriSchema, parseS3Uri, toS3Uri, type S3Uri } from './s3Uri.js';
export { CrawlResultSchema, type CrawlResult } from './crawlResult.js';
export {
  StoryboardSchema,
  SceneSchema,
  SCENE_TYPES,
  V1_MVP_SCENE_TYPES,
  type Storyboard,
  type Scene,
} from './storyboard.js';
```

- [ ] **Step 5: Run tests**

Run:
```bash
pnpm --filter @promptdemo/schema test
```

Expected: PASS — all tests including new 7 storyboard tests.

- [ ] **Step 6: Commit**

```bash
git add packages/schema/src/storyboard.ts packages/schema/src/index.ts packages/schema/tests/storyboard.test.ts
git commit -m "feat(schema): add Storyboard Zod schema with 10 scene types"
```

---

### Task 0.8: Fixtures for local dev + mock mode

**Files:**
- Create: `packages/schema/fixtures/crawlResult.saas-landing.json`    # Tier A
- Create: `packages/schema/fixtures/crawlResult.ecommerce.json`      # Tier B (missing secondary color)
- Create: `packages/schema/fixtures/crawlResult.docs.json`           # Tier B (cheerio-only, no screenshots)
- Create: `packages/schema/fixtures/crawlResult.logo-missing.json`   # Tier B (screenshots OK, logo missing)
- Create: `packages/schema/fixtures/crawlResult.font-unsupported.json` # Tier B (font not in google-fonts)
- Create: `packages/schema/fixtures/storyboard.10s.json`
- Create: `packages/schema/fixtures/storyboard.30s.json`
- Create: `packages/schema/fixtures/storyboard.60s.json`
- Create: `packages/schema/fixtures/storyboard.tierB-fallback.json`
- Create: `packages/schema/tests/fixtures.test.ts`

**Why:** Spec "Development Ergonomics: Mock Mode" — used by API mock mode and Remotion Studio.

- [ ] **Step 1: Write validation test that parses every fixture**

Create `packages/schema/tests/fixtures.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CrawlResultSchema, StoryboardSchema } from '../src/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
function load(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

describe('crawlResult fixtures', () => {
  for (const f of [
    'crawlResult.saas-landing.json',
    'crawlResult.ecommerce.json',
    'crawlResult.docs.json',
    'crawlResult.logo-missing.json',
    'crawlResult.font-unsupported.json',
  ]) {
    it(`${f} is valid`, () => {
      expect(() => CrawlResultSchema.parse(load(f))).not.toThrow();
    });
  }
});

describe('storyboard fixtures', () => {
  for (const f of ['storyboard.10s.json', 'storyboard.30s.json', 'storyboard.60s.json', 'storyboard.tierB-fallback.json']) {
    it(`${f} is valid`, () => {
      expect(() => StoryboardSchema.parse(load(f))).not.toThrow();
    });
  }
});
```

- [ ] **Step 2: Write all 7 fixtures**

Create `packages/schema/fixtures/crawlResult.saas-landing.json`:
```json
{
  "url": "https://example-saas.com",
  "fetchedAt": 1734000000000,
  "screenshots": {
    "viewport": "s3://promptdemo-dev/fixtures/saas-viewport.jpg",
    "fullPage": "s3://promptdemo-dev/fixtures/saas-full.jpg"
  },
  "brand": {
    "primaryColor": "#4f46e5",
    "secondaryColor": "#a78bfa",
    "logoUrl": "s3://promptdemo-dev/fixtures/saas-logo.png",
    "fontFamily": "Inter",
    "fontFamilySupported": true
  },
  "sourceTexts": [
    "ship production-grade ai workflows in minutes",
    "connect your data, run agents, see results",
    "trusted by teams at acme, globex, and initech",
    "soc 2 type ii certified"
  ],
  "features": [
    { "title": "One-click data sync", "description": "Connect 40+ sources", "iconHint": "plug" },
    { "title": "Managed agents", "description": "Serverless, autoscaling", "iconHint": "robot" },
    { "title": "Audit trail", "description": "Every action logged", "iconHint": "shield" }
  ],
  "fallbacks": [],
  "tier": "A",
  "trackUsed": "playwright"
}
```

Create `packages/schema/fixtures/crawlResult.ecommerce.json`:
```json
{
  "url": "https://example-shop.com",
  "fetchedAt": 1734000000000,
  "screenshots": {
    "viewport": "s3://promptdemo-dev/fixtures/shop-viewport.jpg"
  },
  "brand": {
    "primaryColor": "#db2777",
    "logoUrl": "s3://promptdemo-dev/fixtures/shop-logo.png",
    "fontFamily": "Poppins",
    "fontFamilySupported": true
  },
  "sourceTexts": [
    "designed in tokyo, made for everyday",
    "free shipping over $50",
    "30-day returns, no questions asked"
  ],
  "features": [
    { "title": "Limited drop", "description": "Only 500 units" },
    { "title": "Carbon-neutral shipping", "description": "We offset every parcel" }
  ],
  "fallbacks": [{ "field": "secondaryColor", "reason": "not detected", "replacedWith": "#1a1a1a" }],
  "tier": "B",
  "trackUsed": "playwright"
}
```

Create `packages/schema/fixtures/crawlResult.docs.json`:
```json
{
  "url": "https://example-docs.com",
  "fetchedAt": 1734000000000,
  "screenshots": {},
  "brand": {
    "fontFamily": "JetBrains Mono",
    "fontFamilySupported": true
  },
  "sourceTexts": [
    "api reference",
    "quickstart in under 5 minutes",
    "bring your own model"
  ],
  "features": [{ "title": "TypeScript-first", "description": "Full type inference" }],
  "fallbacks": [
    { "field": "primaryColor", "reason": "WAF blocked playwright, fell to cheerio", "replacedWith": "#1a1a1a" },
    { "field": "logoUrl", "reason": "no img with logo alt", "replacedWith": "domain-initial generated" },
    { "field": "screenshots", "reason": "cheerio cannot screenshot", "replacedWith": "all RealShot scenes downgraded to Stylized" }
  ],
  "tier": "B",
  "trackUsed": "cheerio"
}
```

Create `packages/schema/fixtures/crawlResult.logo-missing.json`:
```json
{
  "url": "https://example-nobrand.com",
  "fetchedAt": 1734000000000,
  "screenshots": {
    "viewport": "s3://promptdemo-dev/fixtures/nobrand-viewport.jpg",
    "fullPage": "s3://promptdemo-dev/fixtures/nobrand-full.jpg"
  },
  "brand": {
    "primaryColor": "#10b981",
    "fontFamily": "Inter",
    "fontFamilySupported": true
  },
  "sourceTexts": [
    "build faster",
    "ship weekly",
    "your team, twice the output"
  ],
  "features": [
    { "title": "Ship weekly", "description": "Zero-config deploys" },
    { "title": "Built-in analytics", "description": "Know what to ship next" }
  ],
  "fallbacks": [
    {
      "field": "logoUrl",
      "reason": "no img with logo alt, no header img, no favicon",
      "replacedWith": "domain-initial generated logo at render time"
    }
  ],
  "tier": "B",
  "trackUsed": "playwright"
}
```

Create `packages/schema/fixtures/crawlResult.font-unsupported.json`:
```json
{
  "url": "https://example-customfont.com",
  "fetchedAt": 1734000000000,
  "screenshots": {
    "viewport": "s3://promptdemo-dev/fixtures/cf-viewport.jpg"
  },
  "brand": {
    "primaryColor": "#ef4444",
    "logoUrl": "s3://promptdemo-dev/fixtures/cf-logo.png",
    "fontFamily": "Acme Sans Proprietary",
    "fontFamilySupported": false
  },
  "sourceTexts": [
    "a type foundry for ambitious brands",
    "custom typefaces, licensed per workspace"
  ],
  "features": [{ "title": "Custom typefaces", "description": "Licensed per workspace" }],
  "fallbacks": [
    {
      "field": "fontFamily",
      "reason": "Acme Sans Proprietary not in @remotion/google-fonts whitelist",
      "replacedWith": "Inter (default)"
    }
  ],
  "tier": "B",
  "trackUsed": "playwright"
}
```

Create `packages/schema/fixtures/storyboard.10s.json`:
```json
{
  "videoConfig": {
    "durationInFrames": 300,
    "fps": 30,
    "brandColor": "#4f46e5",
    "logoUrl": "s3://promptdemo-dev/fixtures/saas-logo.png",
    "bgm": "tech"
  },
  "assets": {
    "screenshots": {
      "viewport": "s3://promptdemo-dev/fixtures/saas-viewport.jpg"
    },
    "sourceTexts": [
      "ship production-grade ai workflows in minutes",
      "connect your data, run agents, see results",
      "one-click data sync",
      "connect 40+ sources"
    ]
  },
  "scenes": [
    {
      "sceneId": 1,
      "type": "HeroRealShot",
      "durationInFrames": 90,
      "entryAnimation": "fade",
      "exitAnimation": "fade",
      "props": {
        "title": "ship production-grade ai workflows in minutes",
        "subtitle": "connect your data, run agents, see results",
        "screenshotKey": "viewport"
      }
    },
    {
      "sceneId": 2,
      "type": "FeatureCallout",
      "durationInFrames": 150,
      "entryAnimation": "slideLeft",
      "exitAnimation": "fade",
      "props": {
        "title": "one-click data sync",
        "description": "connect 40+ sources",
        "layout": "leftImage"
      }
    },
    {
      "sceneId": 3,
      "type": "CTA",
      "durationInFrames": 60,
      "entryAnimation": "zoomIn",
      "exitAnimation": "fade",
      "props": {
        "headline": "ship production-grade ai workflows in minutes",
        "url": "https://example-saas.com"
      }
    }
  ]
}
```

Create `packages/schema/fixtures/storyboard.30s.json`:
```json
{
  "videoConfig": {
    "durationInFrames": 900,
    "fps": 30,
    "brandColor": "#4f46e5",
    "logoUrl": "s3://promptdemo-dev/fixtures/saas-logo.png",
    "bgm": "tech"
  },
  "assets": {
    "screenshots": {
      "viewport": "s3://promptdemo-dev/fixtures/saas-viewport.jpg",
      "fullPage": "s3://promptdemo-dev/fixtures/saas-full.jpg"
    },
    "sourceTexts": [
      "ship production-grade ai workflows in minutes",
      "connect your data, run agents, see results",
      "one-click data sync",
      "connect 40+ sources",
      "managed agents",
      "serverless, autoscaling",
      "audit trail",
      "every action logged",
      "trusted by teams at acme, globex, and initech"
    ]
  },
  "scenes": [
    {
      "sceneId": 1,
      "type": "HeroRealShot",
      "durationInFrames": 150,
      "entryAnimation": "fade",
      "exitAnimation": "fade",
      "props": {
        "title": "ship production-grade ai workflows in minutes",
        "subtitle": "connect your data, run agents, see results",
        "screenshotKey": "viewport"
      }
    },
    {
      "sceneId": 2,
      "type": "FeatureCallout",
      "durationInFrames": 180,
      "entryAnimation": "slideLeft",
      "exitAnimation": "fade",
      "props": {
        "title": "one-click data sync",
        "description": "connect 40+ sources",
        "layout": "leftImage"
      }
    },
    {
      "sceneId": 3,
      "type": "FeatureCallout",
      "durationInFrames": 180,
      "entryAnimation": "slideRight",
      "exitAnimation": "fade",
      "props": {
        "title": "managed agents",
        "description": "serverless, autoscaling",
        "layout": "rightImage"
      }
    },
    {
      "sceneId": 4,
      "type": "TextPunch",
      "durationInFrames": 120,
      "entryAnimation": "zoomIn",
      "exitAnimation": "fade",
      "props": {
        "text": "trusted by teams at acme, globex, and initech",
        "emphasis": "primary"
      }
    },
    {
      "sceneId": 5,
      "type": "SmoothScroll",
      "durationInFrames": 180,
      "entryAnimation": "fade",
      "exitAnimation": "fade",
      "props": {
        "screenshotKey": "fullPage",
        "speed": "medium"
      }
    },
    {
      "sceneId": 6,
      "type": "CTA",
      "durationInFrames": 90,
      "entryAnimation": "zoomIn",
      "exitAnimation": "fade",
      "props": {
        "headline": "ship production-grade ai workflows in minutes",
        "url": "https://example-saas.com"
      }
    }
  ]
}
```

Create `packages/schema/fixtures/storyboard.60s.json`:
```json
{
  "videoConfig": {
    "durationInFrames": 1800,
    "fps": 30,
    "brandColor": "#4f46e5",
    "logoUrl": "s3://promptdemo-dev/fixtures/saas-logo.png",
    "bgm": "cinematic"
  },
  "assets": {
    "screenshots": {
      "viewport": "s3://promptdemo-dev/fixtures/saas-viewport.jpg",
      "fullPage": "s3://promptdemo-dev/fixtures/saas-full.jpg"
    },
    "sourceTexts": [
      "ship production-grade ai workflows in minutes",
      "connect your data, run agents, see results",
      "one-click data sync",
      "connect 40+ sources",
      "managed agents",
      "serverless, autoscaling",
      "audit trail",
      "every action logged",
      "trusted by teams at acme, globex, and initech",
      "soc 2 type ii certified"
    ]
  },
  "scenes": [
    {
      "sceneId": 1,
      "type": "HeroRealShot",
      "durationInFrames": 240,
      "entryAnimation": "fade",
      "exitAnimation": "fade",
      "props": {
        "title": "ship production-grade ai workflows in minutes",
        "subtitle": "connect your data, run agents, see results",
        "screenshotKey": "viewport"
      }
    },
    {
      "sceneId": 2,
      "type": "FeatureCallout",
      "durationInFrames": 240,
      "entryAnimation": "slideLeft",
      "exitAnimation": "fade",
      "props": {
        "title": "one-click data sync",
        "description": "connect 40+ sources",
        "layout": "leftImage"
      }
    },
    {
      "sceneId": 3,
      "type": "FeatureCallout",
      "durationInFrames": 240,
      "entryAnimation": "slideRight",
      "exitAnimation": "fade",
      "props": {
        "title": "managed agents",
        "description": "serverless, autoscaling",
        "layout": "rightImage"
      }
    },
    {
      "sceneId": 4,
      "type": "FeatureCallout",
      "durationInFrames": 240,
      "entryAnimation": "slideLeft",
      "exitAnimation": "fade",
      "props": {
        "title": "audit trail",
        "description": "every action logged",
        "layout": "leftImage"
      }
    },
    {
      "sceneId": 5,
      "type": "TextPunch",
      "durationInFrames": 180,
      "entryAnimation": "zoomIn",
      "exitAnimation": "fade",
      "props": {
        "text": "soc 2 type ii certified",
        "emphasis": "primary"
      }
    },
    {
      "sceneId": 6,
      "type": "SmoothScroll",
      "durationInFrames": 360,
      "entryAnimation": "fade",
      "exitAnimation": "fade",
      "props": {
        "screenshotKey": "fullPage",
        "speed": "medium"
      }
    },
    {
      "sceneId": 7,
      "type": "TextPunch",
      "durationInFrames": 150,
      "entryAnimation": "fade",
      "exitAnimation": "fade",
      "props": {
        "text": "trusted by teams at acme, globex, and initech",
        "emphasis": "secondary"
      }
    },
    {
      "sceneId": 8,
      "type": "CTA",
      "durationInFrames": 150,
      "entryAnimation": "zoomIn",
      "exitAnimation": "fade",
      "props": {
        "headline": "ship production-grade ai workflows in minutes",
        "url": "https://example-saas.com"
      }
    }
  ]
}
```

Create `packages/schema/fixtures/storyboard.tierB-fallback.json`:
```json
{
  "videoConfig": {
    "durationInFrames": 900,
    "fps": 30,
    "brandColor": "#1a1a1a",
    "bgm": "minimal"
  },
  "assets": {
    "screenshots": {},
    "sourceTexts": [
      "api reference",
      "quickstart in under 5 minutes",
      "bring your own model",
      "typescript-first"
    ]
  },
  "scenes": [
    {
      "sceneId": 1,
      "type": "TextPunch",
      "durationInFrames": 240,
      "entryAnimation": "fade",
      "exitAnimation": "fade",
      "props": {
        "text": "quickstart in under 5 minutes",
        "emphasis": "primary"
      }
    },
    {
      "sceneId": 2,
      "type": "FeatureCallout",
      "durationInFrames": 270,
      "entryAnimation": "slideLeft",
      "exitAnimation": "fade",
      "props": {
        "title": "typescript-first",
        "description": "bring your own model",
        "layout": "topDown"
      }
    },
    {
      "sceneId": 3,
      "type": "TextPunch",
      "durationInFrames": 240,
      "entryAnimation": "fade",
      "exitAnimation": "fade",
      "props": {
        "text": "api reference",
        "emphasis": "secondary"
      }
    },
    {
      "sceneId": 4,
      "type": "CTA",
      "durationInFrames": 150,
      "entryAnimation": "zoomIn",
      "exitAnimation": "fade",
      "props": {
        "headline": "bring your own model",
        "url": "https://example-docs.com"
      }
    }
  ]
}
```

- [ ] **Step 3: Run fixture validation tests**

Run:
```bash
pnpm --filter @promptdemo/schema test -- fixtures
```

Expected: PASS — all 7 fixtures parse.

- [ ] **Step 4: Commit**

```bash
git add packages/schema/fixtures/ packages/schema/tests/fixtures.test.ts
git commit -m "feat(schema): add validated MVP fixtures for mock mode"
```

---

### Task 0.9: Local dev infra (Redis + MinIO via docker-compose)

**Files:**
- Create: `docker-compose.dev.yaml`
- Create: `.env.example`

**Why:** Crawler Task 1.x uses S3 and BullMQ; dev machines need a lightweight equivalent.

- [ ] **Step 1: Write `docker-compose.dev.yaml`**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data

  minio:
    image: minio/minio:RELEASE.2024-10-02T17-50-41Z
    ports:
      - "9000:9000"
      - "9001:9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio-data:/data

  minio-init:
    image: minio/mc:RELEASE.2024-10-02T08-27-28Z
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      sleep 2;
      mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb --ignore-existing local/promptdemo-dev;
      mc anonymous set download local/promptdemo-dev;
      exit 0;
      "

volumes:
  redis-data:
  minio-data:
```

- [ ] **Step 2: Write `.env.example`**

```
# Redis / BullMQ
REDIS_URL=redis://localhost:6379

# S3 / MinIO (dev)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=promptdemo-dev
S3_FORCE_PATH_STYLE=true

# Crawler
CRAWLER_RESCUE_ENABLED=false
SCREENSHOTONE_ACCESS_KEY=
PLAYWRIGHT_TIMEOUT_MS=15000

# Anthropic (Plan 2)
ANTHROPIC_API_KEY=

# Dev mode
MOCK_MODE=false
NODE_ENV=development
```

- [ ] **Step 3: Verify services boot**

Run:
```bash
docker compose -f docker-compose.dev.yaml up -d
```

Expected: `redis` on :6379, MinIO console at http://localhost:9001, bucket `promptdemo-dev` created by `minio-init`.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.dev.yaml .env.example
git commit -m "chore: local dev infra (redis + minio)"
```

---

### Task 0.10: `infra:check` script (pre-flight for workers)

**Files:**
- Create: `scripts/infra-check.mjs`

**Why:** Workers crash loudly when Redis or MinIO isn't reachable. A fast pre-flight check gives a one-line human-readable error instead of a stack trace, and makes CI-style "is infra up?" scripting trivial.

- [ ] **Step 1: Write `scripts/infra-check.mjs`**

```js
#!/usr/bin/env node
// Quick pre-flight check for dev infra. Exits non-zero if any dependency is down.
import { createConnection } from 'node:net';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

const checks = [];

function checkTcp(name, host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port });
    let done = false;
    const finish = (ok, msg) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ name, ok, msg });
    };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => finish(true, `reachable at ${host}:${port}`));
    sock.once('timeout', () => finish(false, `timeout after ${timeoutMs}ms`));
    sock.once('error', (err) => finish(false, err.message));
  });
}

async function checkMinioBucket() {
  const endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
  const bucket = process.env.S3_BUCKET ?? 'promptdemo-dev';
  const s3 = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? 'minioadmin',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? 'minioadmin',
    },
  });
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    return { name: 'MinIO bucket', ok: true, msg: `${endpoint}/${bucket} exists` };
  } catch (err) {
    return { name: 'MinIO bucket', ok: false, msg: err.message };
  }
}

async function main() {
  const redisUrl = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  checks.push(await checkTcp('Redis', redisUrl.hostname, Number(redisUrl.port || 6379)));
  checks.push(await checkMinioBucket());

  let failed = 0;
  for (const c of checks) {
    const mark = c.ok ? 'OK  ' : 'FAIL';
    console.log(`  [${mark}] ${c.name}: ${c.msg}`);
    if (!c.ok) failed++;
  }
  if (failed > 0) {
    console.error(`\n${failed} dependency check(s) failed. Run: pnpm infra:up`);
    process.exit(1);
  }
  console.log('\nAll infra checks passed.');
}

main().catch((err) => {
  console.error('[infra:check] unexpected error:', err);
  process.exit(2);
});
```

- [ ] **Step 2: Add `@aws-sdk/client-s3` to root devDependencies for the script**

Edit root `package.json` `devDependencies`:
```json
  "devDependencies": {
    "typescript": "5.5.4",
    "vitest": "2.1.1",
    "@types/node": "20.14.10",
    "@aws-sdk/client-s3": "3.658.1"
  }
```

Run:
```bash
pnpm install
```

- [ ] **Step 3: Verify it runs and detects down infra**

With docker compose **down**:
```bash
pnpm infra:check
```
Expected: exits 1, prints `[FAIL] Redis: ...` and/or `[FAIL] MinIO bucket: ...`.

With docker compose **up**:
```bash
pnpm infra:up && sleep 3 && pnpm infra:check
```
Expected: exits 0, prints two `[OK]` lines.

- [ ] **Step 4: Commit**

```bash
git add scripts/infra-check.mjs package.json pnpm-lock.yaml
git commit -m "chore: add infra:check preflight script for redis + minio"
```

---

## Phase 1 — Crawler Worker

### Task 1.1: Scaffold `workers/crawler`

**Files:**
- Create: `workers/crawler/package.json`
- Create: `workers/crawler/tsconfig.json`
- Create: `workers/crawler/src/index.ts`

- [ ] **Step 1: Write `workers/crawler/package.json`**

```json
{
  "name": "@promptdemo/worker-crawler",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@promptdemo/schema": "workspace:*",
    "@aws-sdk/client-s3": "3.658.1",
    "bullmq": "5.21.2",
    "cheerio": "1.0.0",
    "ioredis": "5.4.1",
    "playwright": "1.48.0",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "20.14.10",
    "tsx": "4.19.1",
    "typescript": "5.5.4",
    "vitest": "2.1.1"
  }
}
```

- [ ] **Step 2: Write `workers/crawler/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Write placeholder `src/index.ts`**

```ts
// Bootstrapped in Task 1.10. Kept minimal so typecheck passes.
console.log('crawler worker bootstrap pending');
```

- [ ] **Step 4: Install**

Run:
```bash
pnpm install
npx playwright install chromium
```

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/package.json workers/crawler/tsconfig.json workers/crawler/src/index.ts pnpm-lock.yaml
git commit -m "chore(crawler): scaffold worker package"
```

---

### Task 1.2: Cookie banner dismissal (TDD)

**Files:**
- Create: `workers/crawler/src/cookieBanner.ts`
- Create: `workers/crawler/tests/cookieBanner.test.ts`

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/cookieBanner.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { COOKIE_BANNER_SELECTORS, matchBannerSelector } from '../src/cookieBanner.js';

describe('cookieBanner selectors', () => {
  it('includes OneTrust accept button selector', () => {
    expect(COOKIE_BANNER_SELECTORS.some((s) => s.includes('onetrust'))).toBe(true);
  });

  it('includes Cookiebot selector', () => {
    expect(COOKIE_BANNER_SELECTORS.some((s) => s.toLowerCase().includes('cookiebot'))).toBe(true);
  });

  it('matchBannerSelector returns first matching selector', () => {
    const matcher = (sel: string) => sel === '#onetrust-accept-btn-handler';
    expect(matchBannerSelector(matcher)).toBe('#onetrust-accept-btn-handler');
  });

  it('matchBannerSelector returns null when none match', () => {
    expect(matchBannerSelector(() => false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- cookieBanner
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/cookieBanner.ts`:
```ts
export const COOKIE_BANNER_SELECTORS: readonly string[] = [
  '#onetrust-accept-btn-handler',
  'button#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  'button[aria-label="Accept all cookies"]',
  'button[aria-label*="Accept" i]',
  'button[data-test-id="cookie-policy-manage-dialog-accept-button"]',
  'button[data-cookieman-accept]',
  '.cc-allow',
  '.cc-accept',
  'button.cookie-accept',
  'button[id*="accept" i][id*="cookie" i]',
];

export function matchBannerSelector(tester: (selector: string) => boolean): string | null {
  for (const s of COOKIE_BANNER_SELECTORS) {
    if (tester(s)) return s;
  }
  return null;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/cookieBanner.ts workers/crawler/tests/cookieBanner.test.ts
git commit -m "feat(crawler): cookie banner selector catalog"
```

---

### Task 1.3: WAF / Cloudflare challenge detection (TDD)

**Files:**
- Create: `workers/crawler/src/wafDetect.ts`
- Create: `workers/crawler/tests/wafDetect.test.ts`

**Why:** Spec §4 — triggers Track-2 rescue.

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/wafDetect.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { detectWafBlock } from '../src/wafDetect.js';

describe('detectWafBlock', () => {
  it('detects Cloudflare challenge by title', () => {
    const html = '<html><head><title>Just a moment...</title></head><body></body></html>';
    expect(detectWafBlock({ status: 200, html })).toEqual({ blocked: true, reason: 'cloudflare-challenge' });
  });

  it('detects 403 status', () => {
    expect(detectWafBlock({ status: 403, html: '' })).toEqual({ blocked: true, reason: 'http-403' });
  });

  it('detects 429 status', () => {
    expect(detectWafBlock({ status: 429, html: '' })).toEqual({ blocked: true, reason: 'http-429' });
  });

  it('detects Turnstile iframe in html', () => {
    const html = '<iframe src="https://challenges.cloudflare.com/cdn-cgi/challenge-platform/..."></iframe>';
    expect(detectWafBlock({ status: 200, html })).toEqual({ blocked: true, reason: 'turnstile' });
  });

  it('returns not blocked for clean 200 html', () => {
    expect(detectWafBlock({ status: 200, html: '<html><body>hello</body></html>' })).toEqual({ blocked: false });
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- wafDetect
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/wafDetect.ts`:
```ts
export type WafCheck = { blocked: false } | { blocked: true; reason: string };

export function detectWafBlock(input: { status: number; html: string }): WafCheck {
  if (input.status === 403) return { blocked: true, reason: 'http-403' };
  if (input.status === 429) return { blocked: true, reason: 'http-429' };

  const titleMatch = input.html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.toLowerCase() ?? '';
  if (title.includes('just a moment') || title.includes('attention required')) {
    return { blocked: true, reason: 'cloudflare-challenge' };
  }

  if (input.html.includes('challenges.cloudflare.com/cdn-cgi/challenge-platform')) {
    return { blocked: true, reason: 'turnstile' };
  }

  if (input.html.includes('id="challenge-form"') || input.html.includes('cf-challenge-running')) {
    return { blocked: true, reason: 'cloudflare-challenge' };
  }

  return { blocked: false };
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/wafDetect.ts workers/crawler/tests/wafDetect.test.ts
git commit -m "feat(crawler): WAF / Cloudflare challenge detection"
```

---

### Task 1.4: Text extractor + source-text pool (TDD)

**Files:**
- Create: `workers/crawler/src/extractors/textExtractor.ts`
- Create: `workers/crawler/tests/textExtractor.test.ts`

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/textExtractor.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractSourceTexts } from '../src/extractors/textExtractor.js';

const html = `
<html>
  <head>
    <title>Ship AI workflows</title>
    <meta name="description" content="Build and ship AI in minutes">
  </head>
  <body>
    <h1>  Automate Your Stack  </h1>
    <h2>Fast &amp; reliable</h2>
    <p>Some paragraph text that is short.</p>
    <strong>Trusted by teams</strong>
    <p>${'x'.repeat(300)}</p>
    <h1>Automate Your Stack</h1>
  </body>
</html>
`;

describe('extractSourceTexts', () => {
  it('pulls normalized title and description', () => {
    const texts = extractSourceTexts(html);
    expect(texts).toContain('ship ai workflows');
    expect(texts).toContain('build and ship ai in minutes');
  });

  it('pulls H1-H3 text normalized', () => {
    const texts = extractSourceTexts(html);
    expect(texts).toContain('automate your stack');
    expect(texts).toContain('fast & reliable');
  });

  it('pulls strong text', () => {
    const texts = extractSourceTexts(html);
    expect(texts).toContain('trusted by teams');
  });

  it('dedupes repeated text', () => {
    const texts = extractSourceTexts(html);
    expect(texts.filter((t) => t === 'automate your stack').length).toBe(1);
  });

  it('truncates entries longer than 200 chars', () => {
    const texts = extractSourceTexts(html);
    for (const t of texts) {
      expect(t.length).toBeLessThanOrEqual(200);
    }
  });

  it('returns empty array when no meaningful text', () => {
    expect(extractSourceTexts('<html><body></body></html>')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- textExtractor
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/extractors/textExtractor.ts`:
```ts
import { load } from 'cheerio';
import { normalizeText } from '@promptdemo/schema';

const SELECTORS = ['title', 'meta[name="description"]', 'h1', 'h2', 'h3', 'strong', 'li'];

function truncate(s: string, max = 200): string {
  return s.length <= max ? s : s.slice(0, max);
}

export function extractSourceTexts(html: string): string[] {
  const $ = load(html);
  const out = new Set<string>();

  for (const sel of SELECTORS) {
    $(sel).each((_i, el) => {
      let raw = '';
      if (sel === 'meta[name="description"]') {
        raw = $(el).attr('content') ?? '';
      } else {
        raw = $(el).text();
      }
      const n = normalizeText(raw);
      if (n && n.length >= 2) out.add(truncate(n));
    });
  }

  return [...out];
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/extractors/textExtractor.ts workers/crawler/tests/textExtractor.test.ts
git commit -m "feat(crawler): extract deduped normalized source text pool"
```

---

### Task 1.5: Feature extractor (TDD)

**Files:**
- Create: `workers/crawler/src/extractors/featureExtractor.ts`
- Create: `workers/crawler/tests/featureExtractor.test.ts`

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/featureExtractor.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../src/extractors/featureExtractor.js';

const html = `
<html><body>
  <section>
    <h2>One-click data sync</h2>
    <p>Connect 40+ sources without code.</p>
    <img src="/plug.svg" alt="plug icon">
  </section>
  <section>
    <h3>Managed agents</h3>
    <p>Serverless and autoscaling.</p>
  </section>
  <section>
    <h3></h3>
  </section>
</body></html>
`;

describe('extractFeatures', () => {
  it('pairs H2/H3 with sibling paragraph', () => {
    const f = extractFeatures(html);
    expect(f).toContainEqual(expect.objectContaining({ title: 'one-click data sync', description: 'connect 40+ sources without code.' }));
  });

  it('captures iconHint from nearby img alt', () => {
    const f = extractFeatures(html);
    const match = f.find((x) => x.title === 'one-click data sync');
    expect(match?.iconHint).toBe('plug icon');
  });

  it('accepts features without description', () => {
    const f = extractFeatures('<html><body><section><h2>Auth</h2></section></body></html>');
    expect(f).toEqual([{ title: 'auth' }]);
  });

  it('skips features with empty heading', () => {
    const f = extractFeatures(html);
    expect(f.every((x) => x.title.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- featureExtractor
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/extractors/featureExtractor.ts`:
```ts
import { load } from 'cheerio';
import { normalizeText } from '@promptdemo/schema';

export interface ExtractedFeature {
  title: string;
  description?: string;
  iconHint?: string;
}

export function extractFeatures(html: string): ExtractedFeature[] {
  const $ = load(html);
  const out: ExtractedFeature[] = [];

  $('section').each((_i, section) => {
    const heading = $(section).find('h2, h3').first().text();
    const title = normalizeText(heading);
    if (!title) return;

    const description = normalizeText($(section).find('p').first().text()) || undefined;
    const iconHint = normalizeText($(section).find('img').first().attr('alt') ?? '') || undefined;

    const entry: ExtractedFeature = { title };
    if (description) entry.description = description;
    if (iconHint) entry.iconHint = iconHint;
    out.push(entry);
  });

  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/extractors/featureExtractor.ts workers/crawler/tests/featureExtractor.test.ts
git commit -m "feat(crawler): extract section-level features"
```

---

### Task 1.6: Color sampler (TDD, DOM-targeted)

**Files:**
- Create: `workers/crawler/src/extractors/colorSampler.ts`
- Create: `workers/crawler/tests/colorSampler.test.ts`

**Why:** Spec §4 — must sample from DOM key elements, not whole-page average (which yields dead grey).

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/colorSampler.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { pickDominantFromFrequencies, toHex } from '../src/extractors/colorSampler.js';

describe('toHex', () => {
  it('converts rgb to #rrggbb', () => {
    expect(toHex(255, 85, 0)).toBe('#ff5500');
  });

  it('clamps and zero-pads single digits', () => {
    expect(toHex(1, 2, 3)).toBe('#010203');
  });
});

describe('pickDominantFromFrequencies', () => {
  it('returns most frequent non-neutral color', () => {
    const counts = new Map([
      ['#ffffff', 500], // near-white, filtered
      ['#4f46e5', 100],
      ['#a78bfa', 80],
      ['#000000', 200], // near-black, filtered
    ]);
    expect(pickDominantFromFrequencies(counts)).toEqual({ primary: '#4f46e5', secondary: '#a78bfa' });
  });

  it('returns undefined when only neutral colors present', () => {
    const counts = new Map([
      ['#ffffff', 500],
      ['#eeeeee', 300],
      ['#111111', 200],
    ]);
    expect(pickDominantFromFrequencies(counts)).toEqual({});
  });

  it('handles single-color map', () => {
    const counts = new Map([['#4f46e5', 100]]);
    expect(pickDominantFromFrequencies(counts)).toEqual({ primary: '#4f46e5' });
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- colorSampler
```

Expected: FAIL.

- [ ] **Step 3: Implement (pure functions; Playwright integration in Task 1.8)**

Create `workers/crawler/src/extractors/colorSampler.ts`:
```ts
export function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const NEUTRAL_LUMINANCE_HI = 0.92;
const NEUTRAL_LUMINANCE_LO = 0.08;

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isNeutral(hex: string): boolean {
  const lum = luminance(hex);
  return lum >= NEUTRAL_LUMINANCE_HI || lum <= NEUTRAL_LUMINANCE_LO;
}

export interface DominantColors {
  primary?: string;
  secondary?: string;
}

export function pickDominantFromFrequencies(counts: Map<string, number>): DominantColors {
  const ranked = [...counts.entries()]
    .filter(([hex]) => /^#[0-9a-f]{6}$/i.test(hex) && !isNeutral(hex))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
  const out: DominantColors = {};
  if (ranked[0]) out.primary = ranked[0];
  if (ranked[1]) out.secondary = ranked[1];
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/extractors/colorSampler.ts workers/crawler/tests/colorSampler.test.ts
git commit -m "feat(crawler): DOM-weighted color sampler with neutral filter"
```

---

### Task 1.7: Logo detector (TDD)

**Files:**
- Create: `workers/crawler/src/extractors/logoDetector.ts`
- Create: `workers/crawler/tests/logoDetector.test.ts`

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/logoDetector.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { pickLogoCandidate } from '../src/extractors/logoDetector.js';

describe('pickLogoCandidate', () => {
  it('prefers explicit logo-alt', () => {
    const candidates = [
      { src: '/a.png', alt: 'hero photo', widthPx: 800, source: 'body' as const },
      { src: '/logo.svg', alt: 'ACME logo', widthPx: 120, source: 'img-alt' as const },
    ];
    expect(pickLogoCandidate(candidates)?.src).toBe('/logo.svg');
  });

  it('falls back to header img', () => {
    const candidates = [
      { src: '/banner.png', alt: '', widthPx: 1200, source: 'body' as const },
      { src: '/brand.svg', alt: '', widthPx: 80, source: 'header-img' as const },
    ];
    expect(pickLogoCandidate(candidates)?.src).toBe('/brand.svg');
  });

  it('falls back to favicon', () => {
    const candidates = [{ src: '/favicon.ico', alt: '', widthPx: 32, source: 'favicon' as const }];
    expect(pickLogoCandidate(candidates)?.src).toBe('/favicon.ico');
  });

  it('returns null when no candidates', () => {
    expect(pickLogoCandidate([])).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- logoDetector
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/extractors/logoDetector.ts`:
```ts
export type LogoSource = 'img-alt' | 'header-img' | 'favicon' | 'body';

export interface LogoCandidate {
  src: string;
  alt: string;
  widthPx: number;
  source: LogoSource;
}

const PRIORITY: Record<LogoSource, number> = {
  'img-alt': 100,
  'header-img': 60,
  favicon: 30,
  body: 0,
};

export function pickLogoCandidate(candidates: LogoCandidate[]): LogoCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const diff = PRIORITY[b.source] - PRIORITY[a.source];
    if (diff !== 0) return diff;
    return b.widthPx - a.widthPx;
  });
  return sorted[0] ?? null;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/extractors/logoDetector.ts workers/crawler/tests/logoDetector.test.ts
git commit -m "feat(crawler): logo candidate ranking"
```

---

### Task 1.8: Font detector (TDD)

**Files:**
- Create: `workers/crawler/src/extractors/fontDetector.ts`
- Create: `workers/crawler/tests/fontDetector.test.ts`

**Why:** Spec §6 — must set `fontFamilySupported` based on Remotion's Google Fonts whitelist.

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/fontDetector.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { pickPrimaryFontFamily, isGoogleFontSupported } from '../src/extractors/fontDetector.js';

describe('pickPrimaryFontFamily', () => {
  it('strips quotes and takes first family in the stack', () => {
    expect(pickPrimaryFontFamily('"Inter", Arial, sans-serif')).toBe('Inter');
  });

  it('returns undefined when empty', () => {
    expect(pickPrimaryFontFamily('')).toBeUndefined();
  });

  it('returns undefined for generic-only stacks', () => {
    expect(pickPrimaryFontFamily('sans-serif')).toBeUndefined();
  });
});

describe('isGoogleFontSupported', () => {
  it('returns true for Inter', () => {
    expect(isGoogleFontSupported('Inter')).toBe(true);
  });

  it('returns true for JetBrains Mono', () => {
    expect(isGoogleFontSupported('JetBrains Mono')).toBe(true);
  });

  it('returns false for a proprietary font name', () => {
    expect(isGoogleFontSupported('Acme Sans')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- fontDetector
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/extractors/fontDetector.ts`:
```ts
const GENERICS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', '-apple-system']);

export function pickPrimaryFontFamily(stack: string): string | undefined {
  if (!stack) return undefined;
  const first = stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? '';
  if (!first) return undefined;
  if (GENERICS.has(first.toLowerCase())) return undefined;
  return first;
}

// Keep in sync with @remotion/google-fonts whitelist used by packages/remotion/src/fonts.ts (Plan 3).
const SUPPORTED = new Set([
  'Inter',
  'Poppins',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Playfair Display',
  'JetBrains Mono',
  'Source Sans 3',
  'DM Sans',
  'Nunito',
]);

export function isGoogleFontSupported(family: string): boolean {
  return SUPPORTED.has(family);
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/extractors/fontDetector.ts workers/crawler/tests/fontDetector.test.ts
git commit -m "feat(crawler): primary font family + google-fonts whitelist check"
```

---

### Task 1.9: S3 client wrapper (IAM + path-style)

**Files:**
- Create: `workers/crawler/src/s3/s3Client.ts`
- Create: `workers/crawler/tests/s3Client.test.ts`

**Why:** Spec §1, §4 — workers authenticate via IAM role, write `s3://bucket/key` URIs directly. Dev uses MinIO with path-style + static creds.

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/s3Client.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildKey } from '../src/s3/s3Client.js';

describe('buildKey', () => {
  it('prefixes with jobs/<jobId>/ and sanitizes filename', () => {
    expect(buildKey('abc123', 'viewport.jpg')).toBe('jobs/abc123/viewport.jpg');
  });

  it('strips path separators from filename', () => {
    expect(buildKey('abc', '../../etc/passwd')).toBe('jobs/abc/passwd');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- s3Client
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/s3/s3Client.ts`:
```ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { toS3Uri, type S3Uri } from '@promptdemo/schema';
import { basename } from 'node:path/posix';

export function buildKey(jobId: string, filename: string): string {
  const safe = basename(filename.replace(/\\/g, '/'));
  return `jobs/${jobId}/${safe}`;
}

export interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  forcePathStyle: boolean;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export function makeS3Client(cfg: S3Config): S3Client {
  return new S3Client({
    region: cfg.region,
    endpoint: cfg.endpoint,
    forcePathStyle: cfg.forcePathStyle,
    credentials:
      cfg.accessKeyId && cfg.secretAccessKey
        ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
        : undefined, // production: IAM role from environment
  });
}

export async function putObject(
  client: S3Client,
  bucket: string,
  key: string,
  body: Buffer,
  contentType: string
): Promise<S3Uri> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return toS3Uri(bucket, key);
}

export function s3ConfigFromEnv(env: NodeJS.ProcessEnv): S3Config {
  const cfg: S3Config = {
    region: env.S3_REGION ?? 'us-east-1',
    bucket: env.S3_BUCKET ?? 'promptdemo-dev',
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
  };
  if (env.S3_ENDPOINT) cfg.endpoint = env.S3_ENDPOINT;
  if (env.S3_ACCESS_KEY_ID) cfg.accessKeyId = env.S3_ACCESS_KEY_ID;
  if (env.S3_SECRET_ACCESS_KEY) cfg.secretAccessKey = env.S3_SECRET_ACCESS_KEY;
  return cfg;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/s3/s3Client.ts workers/crawler/tests/s3Client.test.ts
git commit -m "feat(crawler): s3 client wrapper with IAM/path-style support"
```

---

### Task 1.10: Playwright track (integration-style with real browser)

**Files:**
- Create: `workers/crawler/src/tracks/playwrightTrack.ts`
- Create: `workers/crawler/tests/playwrightTrack.test.ts`

**Why:** Primary scraping track. Test runs Playwright against a local HTML fixture via `file://` URL — no network required.

- [ ] **Step 1: Write failing integration test**

Create `workers/crawler/tests/playwrightTrack.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runPlaywrightTrack } from '../src/tracks/playwrightTrack.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

function makeTempHtml(html: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pwtest-'));
  const p = join(dir, 'index.html');
  writeFileSync(p, html, 'utf8');
  return pathToFileURL(p).toString();
}

describe('runPlaywrightTrack', () => {
  it('extracts text, color hint, screenshot buffer for a simple page', async () => {
    const url = makeTempHtml(`
      <html>
        <head>
          <title>Ship AI</title>
          <meta name="description" content="Build and ship">
          <style>
            body{font-family:'Inter',sans-serif;background:#fff;color:#333}
            button{background:#4f46e5;color:#fff;padding:8px 16px}
            header img{width:80px;height:24px}
          </style>
        </head>
        <body>
          <header><img src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" alt="Acme logo"></header>
          <h1>Automate Your Stack</h1>
          <section><h2>Fast sync</h2><p>Connect sources</p></section>
          <button>Sign up</button>
        </body>
      </html>
    `);

    const result = await runPlaywrightTrack({ url, timeoutMs: 10_000 });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.sourceTexts).toContain('ship ai');
    expect(result.sourceTexts).toContain('automate your stack');
    expect(result.viewportScreenshot).toBeInstanceOf(Buffer);
    expect(result.fullPageScreenshot).toBeInstanceOf(Buffer);
    expect(result.logoCandidate?.alt).toBe('acme logo');
    expect(result.fontFamily).toBe('Inter');
  }, 30_000);

  it('returns blocked result on 403', async () => {
    // data: URL with HTTP status is not possible; simulate via about:blank + html with challenge
    const url = makeTempHtml(`
      <html><head><title>Just a moment...</title></head><body></body></html>
    `);
    const result = await runPlaywrightTrack({ url, timeoutMs: 10_000 });
    expect(result.kind).toBe('blocked');
  }, 30_000);
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- playwrightTrack
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/tracks/playwrightTrack.ts`:
```ts
import { chromium, type Browser } from 'playwright';
import { detectWafBlock } from '../wafDetect.js';
import { COOKIE_BANNER_SELECTORS } from '../cookieBanner.js';
import { extractSourceTexts } from '../extractors/textExtractor.js';
import { extractFeatures, type ExtractedFeature } from '../extractors/featureExtractor.js';
import { pickPrimaryFontFamily } from '../extractors/fontDetector.js';
import { pickLogoCandidate, type LogoCandidate } from '../extractors/logoDetector.js';
import { pickDominantFromFrequencies, toHex, type DominantColors } from '../extractors/colorSampler.js';
import { normalizeText } from '@promptdemo/schema';

export type PlaywrightTrackResult =
  | {
      kind: 'ok';
      html: string;
      sourceTexts: string[];
      features: ExtractedFeature[];
      viewportScreenshot: Buffer;
      fullPageScreenshot: Buffer;
      logoCandidate: LogoCandidate | null;
      colors: DominantColors;
      fontFamily?: string;
    }
  | { kind: 'blocked'; reason: string }
  | { kind: 'error'; message: string };

let sharedBrowser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!sharedBrowser) {
    // --disable-dev-shm-usage is critical in Cloud Run / Docker: /dev/shm defaults to 64MB
    // and chromium will crash under load without falling back to /tmp.
    sharedBrowser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }
  return sharedBrowser;
}

export async function closePlaywrightBrowser(): Promise<void> {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

export async function runPlaywrightTrack(input: {
  url: string;
  timeoutMs: number;
}): Promise<PlaywrightTrackResult> {
  const browser = await getBrowser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: input.timeoutMs });
    await page.waitForTimeout(800);

    // Cookie banner dismissal
    for (const sel of COOKIE_BANNER_SELECTORS) {
      try {
        const btn = page.locator(sel).first();
        if (await btn.count() && await btn.isVisible().catch(() => false)) {
          await btn.click({ timeout: 1000 }).catch(() => {});
          await page.waitForTimeout(300);
          break;
        }
      } catch {
        // keep trying next
      }
    }

    const html = await page.content();
    const status = resp?.status() ?? 200;
    const waf = detectWafBlock({ status, html });
    if (waf.blocked) {
      return { kind: 'blocked', reason: waf.reason };
    }

    const sourceTexts = extractSourceTexts(html);
    const features = extractFeatures(html);

    const viewportScreenshot = await page.screenshot({ type: 'jpeg', quality: 88, fullPage: false });
    const fullPageScreenshot = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true });

    // Font family from body computed style
    const bodyFontStack = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    const fontFamily = pickPrimaryFontFamily(bodyFontStack);

    // Color sampling: collect background-color of key elements
    const colorCounts = new Map<string, number>();
    const selectors = ['button', 'a[href]', 'header', '[class*="cta" i]', '[class*="primary" i]'];
    for (const sel of selectors) {
      const rgbs = await page.$$eval(sel, (els) =>
        els.map((el) => getComputedStyle(el).backgroundColor)
      );
      for (const rgb of rgbs) {
        const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (!m || !m[1] || !m[2] || !m[3]) continue;
        const hex = toHex(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
        colorCounts.set(hex, (colorCounts.get(hex) ?? 0) + 1);
      }
    }
    const colors = pickDominantFromFrequencies(colorCounts);

    // Logo candidates: header imgs, alt-contains-logo, favicon
    const imgs = await page.$$eval('img', (els) =>
      els.map((el) => ({
        src: (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src,
        alt: (el as HTMLImageElement).alt ?? '',
        widthPx: (el as HTMLImageElement).naturalWidth || (el as HTMLImageElement).width || 0,
        inHeader: Boolean(el.closest('header')),
      }))
    );
    const favicon = await page.$eval('link[rel*="icon"]', (el) => (el as HTMLLinkElement).href).catch(() => '');

    const candidates: LogoCandidate[] = [];
    for (const img of imgs) {
      const altNorm = normalizeText(img.alt);
      if (altNorm.includes('logo')) {
        candidates.push({ src: img.src, alt: altNorm, widthPx: img.widthPx, source: 'img-alt' });
      } else if (img.inHeader) {
        candidates.push({ src: img.src, alt: altNorm, widthPx: img.widthPx, source: 'header-img' });
      }
    }
    if (favicon) candidates.push({ src: favicon, alt: '', widthPx: 32, source: 'favicon' });
    const logoCandidate = pickLogoCandidate(candidates);

    const ok: PlaywrightTrackResult = {
      kind: 'ok',
      html,
      sourceTexts,
      features,
      viewportScreenshot,
      fullPageScreenshot,
      logoCandidate,
      colors,
    };
    if (fontFamily) ok.fontFamily = fontFamily;
    return ok;
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  } finally {
    await ctx.close();
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS — 2 integration tests green. (May take ~20s.)

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/tracks/playwrightTrack.ts workers/crawler/tests/playwrightTrack.test.ts
git commit -m "feat(crawler): playwright track with screenshot + extractors"
```

---

### Task 1.11: Cheerio track (HTML-only fallback)

**Files:**
- Create: `workers/crawler/src/tracks/cheerioTrack.ts`
- Create: `workers/crawler/tests/cheerioTrack.test.ts`

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/cheerioTrack.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { runCheerioTrack } from '../src/tracks/cheerioTrack.js';

describe('runCheerioTrack', () => {
  it('parses meta + source texts when fetch returns 200', async () => {
    const html = `
      <html>
        <head>
          <title>Docs</title>
          <meta property="og:image" content="https://cdn.example.com/og.png">
          <meta name="theme-color" content="#123456">
          <link rel="icon" href="/favicon.ico">
        </head>
        <body>
          <h1>Quickstart</h1>
          <section><h2>Install</h2><p>pnpm add</p></section>
        </body>
      </html>
    `;
    const fetcher = vi.fn().mockResolvedValue({ status: 200, html });
    const r = await runCheerioTrack({ url: 'https://x.com', fetcher });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.sourceTexts).toContain('docs');
    expect(r.sourceTexts).toContain('quickstart');
    expect(r.colors.primary).toBe('#123456');
    expect(r.ogImageUrl).toBe('https://cdn.example.com/og.png');
  });

  it('returns blocked when fetcher returns 403', async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 403, html: '' });
    const r = await runCheerioTrack({ url: 'https://x.com', fetcher });
    expect(r.kind).toBe('blocked');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- cheerioTrack
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/tracks/cheerioTrack.ts`:
```ts
import { load } from 'cheerio';
import { detectWafBlock } from '../wafDetect.js';
import { extractSourceTexts } from '../extractors/textExtractor.js';
import { extractFeatures, type ExtractedFeature } from '../extractors/featureExtractor.js';

export type CheerioTrackResult =
  | {
      kind: 'ok';
      html: string;
      sourceTexts: string[];
      features: ExtractedFeature[];
      colors: { primary?: string };
      ogImageUrl?: string;
      faviconUrl?: string;
    }
  | { kind: 'blocked'; reason: string }
  | { kind: 'error'; message: string };

export interface HttpFetcher {
  (url: string): Promise<{ status: number; html: string }>;
}

export const defaultFetcher: HttpFetcher = async (url) => {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; PromptDemoBot/0.1; +https://github.com/chadcoco1444/PromptDemo)',
      accept: 'text/html,*/*;q=0.8',
    },
  });
  const html = await res.text();
  return { status: res.status, html };
};

export async function runCheerioTrack(input: {
  url: string;
  fetcher?: HttpFetcher;
}): Promise<CheerioTrackResult> {
  const fetcher = input.fetcher ?? defaultFetcher;
  try {
    const { status, html } = await fetcher(input.url);
    const waf = detectWafBlock({ status, html });
    if (waf.blocked) return { kind: 'blocked', reason: waf.reason };

    const $ = load(html);
    const themeColor = $('meta[name="theme-color"]').attr('content');
    const primary = themeColor && /^#[0-9a-f]{6}$/i.test(themeColor) ? themeColor : undefined;

    const result: CheerioTrackResult = {
      kind: 'ok',
      html,
      sourceTexts: extractSourceTexts(html),
      features: extractFeatures(html),
      colors: primary ? { primary } : {},
    };
    const ogImg = $('meta[property="og:image"]').attr('content');
    if (ogImg) result.ogImageUrl = ogImg;
    const favicon = $('link[rel*="icon"]').attr('href');
    if (favicon) result.faviconUrl = favicon;
    return result;
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/tracks/cheerioTrack.ts workers/crawler/tests/cheerioTrack.test.ts
git commit -m "feat(crawler): cheerio fallback track"
```

---

### Task 1.12: ScreenshotOne rescue track (TDD with mocked HTTP)

**Files:**
- Create: `workers/crawler/src/tracks/screenshotOneTrack.ts`
- Create: `workers/crawler/tests/screenshotOneTrack.test.ts`

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/screenshotOneTrack.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { runScreenshotOneTrack } from '../src/tracks/screenshotOneTrack.js';

describe('runScreenshotOneTrack', () => {
  it('returns ok with html + screenshot bytes when api succeeds', async () => {
    const jpegHead = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const htmlHead = Buffer.from('<html><body><title>Hi</title><h1>Hello</h1></body></html>');
    const adapter = {
      fetchScreenshot: vi.fn().mockResolvedValue(jpegHead),
      fetchHtml: vi.fn().mockResolvedValue(htmlHead.toString('utf8')),
    };
    const r = await runScreenshotOneTrack({ url: 'https://x', accessKey: 'k', adapter });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.viewportScreenshot.equals(jpegHead)).toBe(true);
    expect(r.sourceTexts).toContain('hello');
  });

  it('returns error when api rejects', async () => {
    const adapter = {
      fetchScreenshot: vi.fn().mockRejectedValue(new Error('429 rate limited')),
      fetchHtml: vi.fn(),
    };
    const r = await runScreenshotOneTrack({ url: 'https://x', accessKey: 'k', adapter });
    expect(r.kind).toBe('error');
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- screenshotOneTrack
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/tracks/screenshotOneTrack.ts`:
```ts
import { extractSourceTexts } from '../extractors/textExtractor.js';
import { extractFeatures, type ExtractedFeature } from '../extractors/featureExtractor.js';

export type ScreenshotOneTrackResult =
  | {
      kind: 'ok';
      html: string;
      sourceTexts: string[];
      features: ExtractedFeature[];
      viewportScreenshot: Buffer;
      fullPageScreenshot: Buffer;
    }
  | { kind: 'error'; message: string };

export interface ScreenshotOneAdapter {
  fetchScreenshot(params: { url: string; accessKey: string; fullPage: boolean }): Promise<Buffer>;
  fetchHtml(params: { url: string; accessKey: string }): Promise<string>;
}

export const defaultScreenshotOneAdapter: ScreenshotOneAdapter = {
  async fetchScreenshot({ url, accessKey, fullPage }) {
    const params = new URLSearchParams({
      access_key: accessKey,
      url,
      format: 'jpg',
      image_quality: '85',
      viewport_width: '1280',
      viewport_height: '800',
      full_page: fullPage ? 'true' : 'false',
      block_ads: 'true',
      block_cookie_banners: 'true',
    });
    const res = await fetch(`https://api.screenshotone.com/take?${params}`);
    if (!res.ok) throw new Error(`screenshotone ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  },
  async fetchHtml({ url, accessKey }) {
    const params = new URLSearchParams({ access_key: accessKey, url });
    const res = await fetch(`https://api.screenshotone.com/dom?${params}`);
    if (!res.ok) throw new Error(`screenshotone dom ${res.status}`);
    return await res.text();
  },
};

export async function runScreenshotOneTrack(input: {
  url: string;
  accessKey: string;
  adapter?: ScreenshotOneAdapter;
}): Promise<ScreenshotOneTrackResult> {
  const adapter = input.adapter ?? defaultScreenshotOneAdapter;
  try {
    const [viewport, fullPage, html] = await Promise.all([
      adapter.fetchScreenshot({ url: input.url, accessKey: input.accessKey, fullPage: false }),
      adapter.fetchScreenshot({ url: input.url, accessKey: input.accessKey, fullPage: true }),
      adapter.fetchHtml({ url: input.url, accessKey: input.accessKey }),
    ]);
    return {
      kind: 'ok',
      html,
      sourceTexts: extractSourceTexts(html),
      features: extractFeatures(html),
      viewportScreenshot: viewport,
      fullPageScreenshot: fullPage,
    };
  } catch (err) {
    return { kind: 'error', message: (err as Error).message };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/tracks/screenshotOneTrack.ts workers/crawler/tests/screenshotOneTrack.test.ts
git commit -m "feat(crawler): screenshotone rescue track"
```

---

### Task 1.13: Orchestrator — three-track coordination and CrawlResult assembly (TDD)

**Files:**
- Create: `workers/crawler/src/orchestrator.ts`
- Create: `workers/crawler/tests/orchestrator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `workers/crawler/tests/orchestrator.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { runCrawl } from '../src/orchestrator.js';
import type { PlaywrightTrackResult } from '../src/tracks/playwrightTrack.js';
import type { ScreenshotOneTrackResult } from '../src/tracks/screenshotOneTrack.js';
import type { CheerioTrackResult } from '../src/tracks/cheerioTrack.js';

function fakeUploader() {
  const store: string[] = [];
  return {
    async upload(buf: Buffer, filename: string): Promise<string> {
      store.push(filename);
      return `s3://fake/jobs/j/${filename}`;
    },
    store,
  };
}

describe('runCrawl', () => {
  it('uses playwright ok result → tier A when all fields populated', async () => {
    const pw: PlaywrightTrackResult = {
      kind: 'ok',
      html: '<html></html>',
      sourceTexts: ['hello world'],
      features: [{ title: 'f' }],
      viewportScreenshot: Buffer.from([1]),
      fullPageScreenshot: Buffer.from([2]),
      logoCandidate: { src: 'https://x/logo.svg', alt: 'acme logo', widthPx: 120, source: 'img-alt' },
      colors: { primary: '#4f46e5', secondary: '#a78bfa' },
      fontFamily: 'Inter',
    };
    const up = fakeUploader();
    const result = await runCrawl({
      url: 'https://x.com',
      jobId: 'j',
      rescueEnabled: true,
      runPlaywright: async () => pw,
      runScreenshotOne: async () => ({ kind: 'error', message: 'unused' }) as ScreenshotOneTrackResult,
      runCheerio: async () => ({ kind: 'error', message: 'unused' }) as CheerioTrackResult,
      uploader: up.upload,
      downloadLogo: async () => Buffer.from([9]),
    });
    expect(result.tier).toBe('A');
    expect(result.trackUsed).toBe('playwright');
    expect(result.brand.primaryColor).toBe('#4f46e5');
    expect(result.brand.logoUrl).toMatch(/^s3:\/\//);
  });

  it('falls through playwright blocked → screenshotone ok → tier B with substitutions', async () => {
    const up = fakeUploader();
    const result = await runCrawl({
      url: 'https://x.com',
      jobId: 'j',
      rescueEnabled: true,
      runPlaywright: async () => ({ kind: 'blocked', reason: 'http-403' }),
      runScreenshotOne: async () => ({
        kind: 'ok',
        html: '<title>Hi</title><body><h1>Hello</h1></body>',
        sourceTexts: ['hi', 'hello'],
        features: [],
        viewportScreenshot: Buffer.from([1]),
        fullPageScreenshot: Buffer.from([2]),
      }),
      runCheerio: async () => ({ kind: 'error', message: 'unused' }),
      uploader: up.upload,
      downloadLogo: async () => null,
    });
    expect(result.trackUsed).toBe('screenshot-saas');
    expect(result.tier).toBe('B');
    expect(result.brand.primaryColor).toBe('#1a1a1a'); // substituted
    expect(result.fallbacks.find((f) => f.field === 'primaryColor')).toBeDefined();
  });

  it('falls through playwright blocked → screenshotone disabled → cheerio ok → tier B (no screenshots)', async () => {
    const up = fakeUploader();
    const result = await runCrawl({
      url: 'https://x.com',
      jobId: 'j',
      rescueEnabled: false,
      runPlaywright: async () => ({ kind: 'blocked', reason: 'http-429' }),
      runScreenshotOne: async () => ({ kind: 'error', message: 'disabled' }),
      runCheerio: async () => ({
        kind: 'ok',
        html: '<title>Docs</title><body><h1>Quick</h1></body>',
        sourceTexts: ['docs', 'quick'],
        features: [],
        colors: {},
      }),
      uploader: up.upload,
      downloadLogo: async () => null,
    });
    expect(result.trackUsed).toBe('cheerio');
    expect(result.screenshots.viewport).toBeUndefined();
    expect(result.fallbacks.find((f) => f.field === 'screenshots')).toBeDefined();
  });

  it('throws when all three tracks fail', async () => {
    await expect(
      runCrawl({
        url: 'https://x.com',
        jobId: 'j',
        rescueEnabled: true,
        runPlaywright: async () => ({ kind: 'error', message: 'pw' }),
        runScreenshotOne: async () => ({ kind: 'error', message: 'so' }),
        runCheerio: async () => ({ kind: 'error', message: 'ch' }),
        uploader: fakeUploader().upload,
        downloadLogo: async () => null,
      })
    ).rejects.toThrow(/all tracks failed/i);
  });

  it('throws when sourceTexts empty (tier-C in spec, MVP fails)', async () => {
    await expect(
      runCrawl({
        url: 'https://x.com',
        jobId: 'j',
        rescueEnabled: true,
        runPlaywright: async () => ({ kind: 'error', message: 'x' }),
        runScreenshotOne: async () => ({ kind: 'error', message: 'x' }),
        runCheerio: async () => ({ kind: 'ok', html: '', sourceTexts: [], features: [], colors: {} }),
        uploader: fakeUploader().upload,
        downloadLogo: async () => null,
      })
    ).rejects.toThrow(/tier.?c/i);
  });
});
```

- [ ] **Step 2: Run to verify fail**

```bash
pnpm --filter @promptdemo/worker-crawler test -- orchestrator
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `workers/crawler/src/orchestrator.ts`:
```ts
import { CrawlResultSchema, type CrawlResult, type S3Uri } from '@promptdemo/schema';
import type { PlaywrightTrackResult } from './tracks/playwrightTrack.js';
import type { ScreenshotOneTrackResult } from './tracks/screenshotOneTrack.js';
import type { CheerioTrackResult } from './tracks/cheerioTrack.js';
import { isGoogleFontSupported } from './extractors/fontDetector.js';

const DEFAULT_BRAND_COLOR = '#1a1a1a';

export interface CrawlRunnerInput {
  url: string;
  jobId: string;
  rescueEnabled: boolean;
  runPlaywright: (url: string) => Promise<PlaywrightTrackResult>;
  runScreenshotOne: (url: string) => Promise<ScreenshotOneTrackResult>;
  runCheerio: (url: string) => Promise<CheerioTrackResult>;
  uploader: (buf: Buffer, filename: string) => Promise<S3Uri>;
  downloadLogo: (src: string) => Promise<Buffer | null>;
}

interface IntermediateState {
  html: string;
  sourceTexts: string[];
  features: Array<{ title: string; description?: string; iconHint?: string }>;
  viewportBuf?: Buffer;
  fullPageBuf?: Buffer;
  colors: { primary?: string; secondary?: string };
  fontFamily?: string;
  logo?: { src: string; alt?: string };
  trackUsed: 'playwright' | 'screenshot-saas' | 'cheerio';
}

export async function runCrawl(input: CrawlRunnerInput): Promise<CrawlResult> {
  const fallbacks: CrawlResult['fallbacks'] = [];
  const intermediate = await pickTrack(input, fallbacks);

  if (intermediate.sourceTexts.length === 0) {
    throw new Error('tier-C: no source text extracted from any track');
  }

  const screenshots: CrawlResult['screenshots'] = {};
  if (intermediate.viewportBuf) {
    screenshots.viewport = await input.uploader(intermediate.viewportBuf, 'viewport.jpg');
  }
  if (intermediate.fullPageBuf) {
    screenshots.fullPage = await input.uploader(intermediate.fullPageBuf, 'fullpage.jpg');
  }
  if (!screenshots.viewport && !screenshots.fullPage) {
    fallbacks.push({
      field: 'screenshots',
      reason: 'not available from track',
      replacedWith: 'RealShot scenes downgrade to Stylized',
    });
  }

  const brand: CrawlResult['brand'] = {};
  if (intermediate.colors.primary) {
    brand.primaryColor = intermediate.colors.primary;
  } else {
    brand.primaryColor = DEFAULT_BRAND_COLOR;
    fallbacks.push({
      field: 'primaryColor',
      reason: 'not detected',
      replacedWith: DEFAULT_BRAND_COLOR,
    });
  }
  if (intermediate.colors.secondary) brand.secondaryColor = intermediate.colors.secondary;
  if (intermediate.fontFamily) {
    brand.fontFamily = intermediate.fontFamily;
    brand.fontFamilySupported = isGoogleFontSupported(intermediate.fontFamily);
    if (!brand.fontFamilySupported) {
      fallbacks.push({
        field: 'fontFamily',
        reason: `${intermediate.fontFamily} not in @remotion/google-fonts whitelist`,
        replacedWith: 'Inter (default)',
      });
    }
  } else {
    fallbacks.push({ field: 'fontFamily', reason: 'not detected', replacedWith: 'Inter (default)' });
  }
  if (intermediate.logo) {
    const bytes = await input.downloadLogo(intermediate.logo.src);
    if (bytes) {
      brand.logoUrl = await input.uploader(bytes, 'logo.img');
    } else {
      fallbacks.push({
        field: 'logoUrl',
        reason: 'download failed or empty',
        replacedWith: 'domain-initial generated logo at render time',
      });
    }
  } else {
    fallbacks.push({
      field: 'logoUrl',
      reason: 'no logo candidate found',
      replacedWith: 'domain-initial generated logo at render time',
    });
  }

  const tier: CrawlResult['tier'] = fallbacks.length === 0 ? 'A' : 'B';

  const raw: CrawlResult = {
    url: input.url,
    fetchedAt: Date.now(),
    screenshots,
    brand,
    sourceTexts: intermediate.sourceTexts,
    features: intermediate.features,
    fallbacks,
    tier,
    trackUsed: intermediate.trackUsed,
  };

  return CrawlResultSchema.parse(raw);
}

async function pickTrack(
  input: CrawlRunnerInput,
  fallbacks: CrawlResult['fallbacks']
): Promise<IntermediateState> {
  const pw = await input.runPlaywright(input.url);
  if (pw.kind === 'ok') {
    const s: IntermediateState = {
      html: pw.html,
      sourceTexts: pw.sourceTexts,
      features: pw.features,
      viewportBuf: pw.viewportScreenshot,
      fullPageBuf: pw.fullPageScreenshot,
      colors: pw.colors,
      trackUsed: 'playwright',
    };
    if (pw.fontFamily) s.fontFamily = pw.fontFamily;
    if (pw.logoCandidate) s.logo = { src: pw.logoCandidate.src, alt: pw.logoCandidate.alt };
    return s;
  }
  fallbacks.push({ field: 'track:playwright', reason: reasonOf(pw), replacedWith: 'trying next track' });

  if (input.rescueEnabled) {
    const so = await input.runScreenshotOne(input.url);
    if (so.kind === 'ok') {
      return {
        html: so.html,
        sourceTexts: so.sourceTexts,
        features: so.features,
        viewportBuf: so.viewportScreenshot,
        fullPageBuf: so.fullPageScreenshot,
        colors: {},
        trackUsed: 'screenshot-saas',
      };
    }
    fallbacks.push({
      field: 'track:screenshot-saas',
      reason: reasonOf(so),
      replacedWith: 'trying next track',
    });
  } else {
    fallbacks.push({
      field: 'track:screenshot-saas',
      reason: 'rescue disabled',
      replacedWith: 'skipped',
    });
  }

  const ch = await input.runCheerio(input.url);
  if (ch.kind === 'ok') {
    return {
      html: ch.html,
      sourceTexts: ch.sourceTexts,
      features: ch.features,
      colors: ch.colors,
      trackUsed: 'cheerio',
    };
  }
  throw new Error(`all tracks failed: pw=${reasonOf(pw)}, so=disabled-or-err, ch=${reasonOf(ch)}`);
}

function reasonOf(r: { kind: string; reason?: string; message?: string }): string {
  if (r.kind === 'blocked') return `blocked:${r.reason}`;
  if (r.kind === 'error') return `error:${r.message}`;
  return r.kind;
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm --filter @promptdemo/worker-crawler test
```

Expected: PASS — all orchestrator tests plus prior tracks/extractors still green.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/orchestrator.ts workers/crawler/tests/orchestrator.test.ts
git commit -m "feat(crawler): three-track orchestrator with fallback metadata"
```

---

### Task 1.14: Worker entry point — BullMQ bootstrap

**Files:**
- Modify: `workers/crawler/src/index.ts`
- Create: `workers/crawler/src/logoDownloader.ts`

- [ ] **Step 1: Implement `logoDownloader.ts`**

Create `workers/crawler/src/logoDownloader.ts`:
```ts
export async function downloadLogo(src: string): Promise<Buffer | null> {
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 512_000) return null; // guard
    return buf;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Replace `workers/crawler/src/index.ts`**

```ts
import { Worker, type Job } from 'bullmq';
import IORedis from 'ioredis';
import { z } from 'zod';
import {
  makeS3Client,
  putObject,
  buildKey,
  s3ConfigFromEnv,
} from './s3/s3Client.js';
import { runCrawl } from './orchestrator.js';
import { runPlaywrightTrack, closePlaywrightBrowser } from './tracks/playwrightTrack.js';
import { runScreenshotOneTrack } from './tracks/screenshotOneTrack.js';
import { runCheerioTrack } from './tracks/cheerioTrack.js';
import { downloadLogo } from './logoDownloader.js';
import type { S3Uri } from '@promptdemo/schema';

const JobPayload = z.object({ jobId: z.string().min(1), url: z.string().url() });
type JobPayload = z.infer<typeof JobPayload>;

const env = process.env;
const redisUrl = env.REDIS_URL ?? 'redis://localhost:6379';
const rescueEnabled = env.CRAWLER_RESCUE_ENABLED === 'true';
const screenshotOneKey = env.SCREENSHOTONE_ACCESS_KEY ?? '';
const playwrightTimeoutMs = Number(env.PLAYWRIGHT_TIMEOUT_MS ?? '15000');

const s3Cfg = s3ConfigFromEnv(env);
const s3 = makeS3Client(s3Cfg);
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const worker = new Worker<JobPayload>(
  'crawl',
  async (job: Job<JobPayload>) => {
    const payload = JobPayload.parse(job.data);

    const uploader = async (buf: Buffer, filename: string): Promise<S3Uri> => {
      const key = buildKey(payload.jobId, filename);
      const contentType = filename.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream';
      return putObject(s3, s3Cfg.bucket, key, buf, contentType);
    };

    const result = await runCrawl({
      url: payload.url,
      jobId: payload.jobId,
      rescueEnabled,
      runPlaywright: (url) => runPlaywrightTrack({ url, timeoutMs: playwrightTimeoutMs }),
      runScreenshotOne: (url) =>
        screenshotOneKey
          ? runScreenshotOneTrack({ url, accessKey: screenshotOneKey })
          : Promise.resolve({ kind: 'error', message: 'SCREENSHOTONE_ACCESS_KEY unset' } as const),
      runCheerio: (url) => runCheerioTrack({ url }),
      uploader,
      downloadLogo,
    });

    // Publish crawlResult.json next to the other artifacts.
    const resultJsonKey = buildKey(payload.jobId, 'crawlResult.json');
    const resultUri = await putObject(
      s3,
      s3Cfg.bucket,
      resultJsonKey,
      Buffer.from(JSON.stringify(result, null, 2)),
      'application/json'
    );
    return { crawlResultUri: resultUri };
  },
  {
    connection,
    concurrency: 2, // crawler is I/O-bound; safe above 1
    lockDuration: 90_000,
  }
);

worker.on('failed', (job, err) => {
  console.error('[crawler] job failed', { jobId: job?.id, err: err.message });
});

const shutdown = async () => {
  console.log('[crawler] shutting down');
  await worker.close();
  await connection.quit();
  await closePlaywrightBrowser();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[crawler] worker started, queue=crawl');
```

- [ ] **Step 3: Typecheck**

Run:
```bash
pnpm --filter @promptdemo/worker-crawler typecheck
```

Expected: PASS.

- [ ] **Step 4: Smoke-run against MinIO + Redis**

```bash
docker compose -f docker-compose.dev.yaml up -d
cp .env.example .env
# edit .env to set SCREENSHOTONE_ACCESS_KEY if you want Track 2
pnpm --filter @promptdemo/worker-crawler start &
```

In another terminal, enqueue a test job:
```bash
node -e "
const {Queue}=require('bullmq');
const q=new Queue('crawl',{connection:{host:'localhost',port:6379}});
q.add('c',{jobId:'test-'+Date.now(),url:'https://example.com'}).then(()=>q.close());
"
```

Expected: log entry `[crawler] job started/completed`, new object under `promptdemo-dev/jobs/test-*/crawlResult.json` visible at http://localhost:9001.

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/src/index.ts workers/crawler/src/logoDownloader.ts
git commit -m "feat(crawler): BullMQ worker bootstrap with S3 artifact publish"
```

---

### Task 1.15: Dockerfile with `tini` entrypoint + Cloud Run sizing guidance

**Files:**
- Create: `workers/crawler/Dockerfile`
- Create: `workers/crawler/.dockerignore`
- Create: `workers/crawler/CLOUD_RUN.md`

**Why:** Spec §4 — Playwright orphans zombies under high volume; `tini` as PID 1 reaps them. BullMQ `concurrency: 2` means one container serves two Playwright jobs simultaneously, so resource sizing must keep pace or both jobs thrash.

- [ ] **Step 1: Write `.dockerignore`**

```
node_modules
dist
coverage
.env
.env.local
tests
**/*.test.ts
Dockerfile
.dockerignore
```

- [ ] **Step 2: Write `Dockerfile`**

```dockerfile
# Build stage
FROM node:20.11.1-bookworm-slim AS build
WORKDIR /repo

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy manifests for reproducible install
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY workers/crawler/package.json workers/crawler/

RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/schema/ packages/schema/
COPY workers/crawler/ workers/crawler/

# Runtime stage
FROM mcr.microsoft.com/playwright:v1.48.0-jammy AS runtime

# tini for PID 1 zombie reaping (critical for headless chromium)
RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo
COPY --from=build /repo /repo

WORKDIR /repo/workers/crawler
ENV NODE_ENV=production

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
```

- [ ] **Step 3: Build verification (optional locally)**

```bash
docker build -f workers/crawler/Dockerfile -t promptdemo/crawler:dev .
```

Expected: build succeeds.

- [ ] **Step 4: Write `workers/crawler/CLOUD_RUN.md` (deployment sizing)**

```markdown
# Crawler Worker — Cloud Run Sizing

The BullMQ worker uses `concurrency: 2`, so each container runs up to two
Playwright + Chromium contexts simultaneously. Under-provisioning causes
context timeouts under real traffic, not load-test traffic.

## Minimum recommended config

| Setting                       | Value   | Reason                                               |
|------------------------------|---------|------------------------------------------------------|
| CPU                          | 2 vCPU  | 1 vCPU per concurrent Playwright context             |
| Memory                       | 2 GiB   | Each Chromium + full-page screenshot ≈ 400–700 MiB   |
| CPU boost on startup         | enabled | Playwright launch is CPU-bound for ~2s               |
| Min instances                | 0 or 1  | 1 avoids cold-start latency on demo traffic          |
| Max instances                | 10      | See §3 Global Backpressure — queue cap supersedes    |
| Request timeout              | 600s    | Matches `lockDuration` in BullMQ worker options      |
| HTTP concurrency (if any)    | 1       | We do not expose HTTP; this is for health probes     |
| Execution environment        | gen2    | Required for `--disable-dev-shm-usage` to work well  |

## Failure modes and symptoms

- **OOMKilled on fullPage screenshots** → bump memory to 4 GiB.
- **"Protocol error: Target closed"** → CPU starvation from concurrency=2
  on 1 vCPU. Bump CPU, not concurrency.
- **Zombie chromium processes** → `tini` entrypoint missing or image base
  not set correctly.
- **Redis connection reset every 90s** → `lockDuration` too aggressive for
  p99 crawl time; bump to 120_000 and revisit Playwright timeout.
```

- [ ] **Step 5: Commit**

```bash
git add workers/crawler/Dockerfile workers/crawler/.dockerignore workers/crawler/CLOUD_RUN.md
git commit -m "feat(crawler): Dockerfile with tini + cloud run sizing guide"
```

---

### Task 1.16: Final typecheck + test across workspace

**Files:** (no changes, verification only)

- [ ] **Step 1: Run full workspace typecheck**

```bash
pnpm -r typecheck
```

Expected: no errors.

- [ ] **Step 2: Run full workspace tests**

```bash
pnpm -r test
```

Expected: all green, including Playwright integration test.

- [ ] **Step 3: Tag milestone**

```bash
git tag -a v0.1.0-foundation -m "Phase 0+1: schema + crawler worker complete"
```

- [ ] **Step 4: Push**

```bash
git push origin main
git push origin v0.1.0-foundation
```

---

## Self-Review (inline)

**Spec coverage:**
- §1 Stack (pnpm, Fastify, BullMQ, IAM S3, Redis, Playwright) — partially covered: schema + crawler + infra. API/SSE/render live in Plans 4–5. ✓ scoped.
- §1 `normalizeText` shared between crawler and storyboard worker — Task 0.4 ✓.
- §2 Storyboard schema with 10 types forward-compat, 5 MVP enum exposed — Task 0.7 ✓.
- §3 Job/API — out of scope (Plan 4).
- §4 Three-track crawl with WAF detect, cookie dismiss, color sampling from DOM, logo detection, font whitelist, s3:// URIs, IAM auth — Tasks 1.2–1.14 ✓.
- §4 `tini` Dockerfile entrypoint — Task 1.15 ✓.
- §5 Validation pipeline — out of scope (Plan 2).
- §6 Remotion — out of scope (Plan 3).
- Mock mode fixtures — Task 0.8 ✓.

**Placeholder scan:** no `TBD` / `TODO` / "fill in later" / "handle edge cases" without code. `// production: IAM role from environment` in s3Client is a comment describing runtime behavior, not a missing step — acceptable.

**Type consistency:**
- `CrawlResult.brand.logoUrl` is `S3Uri` in schema and orchestrator populates via `uploader()` which returns `S3Uri` ✓
- `runPlaywrightTrack` returns `logoCandidate: LogoCandidate | null` and orchestrator reads `pw.logoCandidate` ✓
- `S3_FORCE_PATH_STYLE` env is `'true'` string; `s3ConfigFromEnv` compares `=== 'true'` ✓
- Fixture storyboard 30s scene durations: 150+180+180+120+180+90 = 900 ✓
- Fixture storyboard 60s scene durations: 240+240+240+240+180+360+150+150 = 1800 ✓
- Fixture storyboard 10s scene durations: 90+150+60 = 300 ✓
- Fixture tierB-fallback scene durations: 240+270+240+150 = 900 ✓ (matches videoConfig)

All consistent. Plan is complete.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-20-phase-0-1-foundation-and-crawler.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — I execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
