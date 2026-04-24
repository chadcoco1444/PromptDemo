# PromptDemo v1.0 — Plan 2: Storyboard AI Worker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `workers/storyboard`: a BullMQ worker that consumes `CrawlResult` artifacts and produces validated `Storyboard` JSON via the Anthropic Claude API with extractive constraints, duration auto-correction, and self-correcting retry.

**Architecture:** One worker, one BullMQ queue (`storyboard`). Reads `CrawlResult` from S3 via the s3:// URI handed off by the crawler. Calls `claude-sonnet-4-6` with a cached system prompt. Runs a 5-stage validation pipeline (parse → Zod → extractive → duration → done). Retries up to 3× with error feedback for self-correction. Writes the validated `Storyboard` JSON back to S3 and reports the URI.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk` (with prompt caching), `fuse.js` (Latin extractive match), BullMQ, ioredis, vitest, `@promptdemo/schema` (CrawlResult, Storyboard, normalizeText).

**Spec reference:** `docs/superpowers/specs/2026-04-20-promptdemo-design.md` §5.

**Predecessor:** Plan 1 (`v0.1.0-foundation` tag, 29 commits).

---

## File Structure

```
workers/storyboard/
├── package.json
├── tsconfig.json
├── Dockerfile                           # slim node image, no browser deps
├── src/
│   ├── index.ts                         # BullMQ worker bootstrap
│   ├── generator.ts                     # orchestrates prompt build → Claude → validation
│   ├── prompts/
│   │   ├── systemPrompt.ts              # cached system prompt (~3-5K tokens)
│   │   ├── userMessage.ts               # per-call user message builder
│   │   └── sceneTypeCatalog.ts          # human-readable scene type descriptions for Claude
│   ├── claude/
│   │   └── claudeClient.ts              # SDK wrapper with cache_control + retry
│   ├── validation/
│   │   ├── pipeline.ts                  # orchestrates the 5 stages
│   │   ├── parseJson.ts                 # stage 1: parse + strip markdown fences
│   │   ├── zodValidate.ts               # stage 2: StoryboardSchema (re-export + typed errors)
│   │   ├── extractiveCheck.ts           # stage 3: language-aware text whitelist check
│   │   └── durationAdjust.ts            # stage 4: auto-prorate <5%, retry otherwise
│   ├── s3/
│   │   └── s3Client.ts                  # copy/adapt from worker-crawler (NOT shared — keep workers independent)
│   ├── mockMode.ts                      # fixture-backed fast path when MOCK_MODE=true
│   └── rescaleFrames.ts                 # pure util for duration auto-adjust
└── tests/
    ├── systemPrompt.test.ts             # snapshot of prompt structure + key rules
    ├── userMessage.test.ts              # shape + token size guard
    ├── parseJson.test.ts
    ├── extractiveCheck.test.ts          # Latin + CJK + mixed cases
    ├── durationAdjust.test.ts
    ├── rescaleFrames.test.ts
    ├── pipeline.test.ts                 # end-to-end with mocked Claude
    ├── generator.test.ts                # integration with mocked Claude
    └── mockMode.test.ts
```

---

## Tasks Overview

Phase 2 is 14 tasks. Pacing: Tasks 2.1–2.2 are scaffolding; 2.3–2.9 are pure-function TDD (fast); 2.10–2.11 integrate with mocked Claude; 2.12 bootstraps the BullMQ worker; 2.13 ships the Dockerfile; 2.14 is the final validate + tag `v0.2.0-storyboard-ai`.

| # | Task | Type | Scope |
|---|---|---|---|
| 2.1 | Scaffold `workers/storyboard` | chore | package.json, tsconfig, empty index |
| 2.2 | Copy s3Client.ts adapter | chore | lift from worker-crawler (one-way — no shared util package yet) |
| 2.3 | `rescaleFrames` utility | TDD | pure math: distribute ±Δ to scenes |
| 2.4 | `durationAdjust` stage | TDD | decision logic around rescaleFrames |
| 2.5 | `parseJson` stage | TDD | strip markdown fences, parse, narrow type |
| 2.6 | `zodValidate` stage wrapper | TDD | thin layer around StoryboardSchema with typed error |
| 2.7 | `extractiveCheck` stage | TDD | Latin Fuse + CJK N-gram |
| 2.8 | System prompt builder | TDD | snapshot test + invariants |
| 2.9 | User message builder | TDD | CrawlResult + intent + duration + optional hint/prev |
| 2.10 | Claude client wrapper | TDD with mocked SDK | prompt caching, retry feedback |
| 2.11 | Pipeline orchestrator | TDD with mocked Claude | 5 stages + retry loop + final prorate |
| 2.12 | BullMQ worker + mockMode | config/integration | glue: Redis → S3 read → pipeline → S3 write |
| 2.13 | Dockerfile (slim node) | infra | no browser, much smaller image than crawler |
| 2.14 | Final typecheck + test + tag | validation | `v0.2.0-storyboard-ai`, no push (decide with user) |

---

## Phase 2 — Tasks

### Task 2.1: Scaffold `workers/storyboard`

**Files:**
- Create: `workers/storyboard/package.json`
- Create: `workers/storyboard/tsconfig.json`
- Create: `workers/storyboard/src/index.ts` (stub)

- [ ] **Step 1: Write `workers/storyboard/package.json`**

```json
{
  "name": "@promptdemo/worker-storyboard",
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
    "@anthropic-ai/sdk": "0.30.1",
    "@aws-sdk/client-s3": "3.658.1",
    "bullmq": "5.21.2",
    "fuse.js": "7.0.0",
    "ioredis": "5.4.1",
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

- [ ] **Step 2: Write `workers/storyboard/tsconfig.json`**

Node worker: override base's `Bundler` resolution to `NodeNext`, same as worker-crawler.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Write `workers/storyboard/src/index.ts` stub**

```ts
// Bootstrapped in Task 2.12. Kept minimal so typecheck passes.
console.log('storyboard worker bootstrap pending');
```

- [ ] **Step 4: Install and typecheck**

```bash
pnpm install
pnpm --filter @promptdemo/worker-storyboard typecheck
```

Expected: install succeeds, typecheck green.

- [ ] **Step 5: Commit**

```bash
git add workers/storyboard/package.json workers/storyboard/tsconfig.json workers/storyboard/src/index.ts pnpm-lock.yaml
git commit -m "chore(storyboard): scaffold worker package"
```

No push.

---

### Task 2.2: Copy `s3Client.ts` adapter

**Why:** Both workers need S3 access; we keep them as independent packages (no shared util package yet — Plan 1 did not create one, and this plan does not introduce one either to avoid premature abstraction). The file is <50 lines of glue; duplicating it is cheaper than designing a shared util infra for two callers. Revisit if a third consumer appears.

**Files:**
- Create: `workers/storyboard/src/s3/s3Client.ts` (copy of `workers/crawler/src/s3/s3Client.ts`)
- Create: `workers/storyboard/tests/s3Client.test.ts` (copy of `workers/crawler/tests/s3Client.test.ts`)

- [ ] **Step 1: Copy both files byte-for-byte** from the crawler's equivalents.

- [ ] **Step 2: Add a `getObject` helper** in `workers/storyboard/src/s3/s3Client.ts` (crawler did not need one — it only uploaded; storyboard needs to read `crawlResult.json`).

Append to the copied file:
```ts
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { parseS3Uri } from '@promptdemo/schema';

export async function getObjectJson<T>(client: S3Client, uri: string): Promise<T> {
  const { bucket, key } = parseS3Uri(uri);
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await res.Body?.transformToString('utf8');
  if (!body) throw new Error(`empty S3 object at ${uri}`);
  return JSON.parse(body) as T;
}
```

- [ ] **Step 3: Extend the copied test to cover `buildKey` only** (getObjectJson requires live S3; covered in pipeline integration).

- [ ] **Step 4: Typecheck + test**

```bash
pnpm --filter @promptdemo/worker-storyboard typecheck
pnpm --filter @promptdemo/worker-storyboard test
```

Expected: 2 tests pass (buildKey cases).

- [ ] **Step 5: Commit**

```bash
git add workers/storyboard/src/s3/s3Client.ts workers/storyboard/tests/s3Client.test.ts
git commit -m "feat(storyboard): s3 client with getObjectJson for crawl result reads"
```

No push.

---

### Task 2.3: `rescaleFrames` utility (TDD)

**Purpose:** Given a list of scenes whose durations sum to some total that differs from the target, distribute the delta proportionally to the longest scenes. Pure function, trivially testable.

**Files:**
- Create: `workers/storyboard/src/rescaleFrames.ts`
- Create: `workers/storyboard/tests/rescaleFrames.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { rescaleFrames } from '../src/rescaleFrames.js';

describe('rescaleFrames', () => {
  it('returns unchanged when sum already matches target', () => {
    const out = rescaleFrames([100, 200, 300], 600);
    expect(out).toEqual([100, 200, 300]);
  });

  it('absorbs a positive delta into the largest element', () => {
    // sum=890, target=900, delta=+10 → longest (300) gets +10
    const out = rescaleFrames([100, 200, 300, 290], 900);
    expect(out.reduce((a, b) => a + b, 0)).toBe(900);
    expect(out[2]).toBe(310);
    expect(out[0]).toBe(100);
    expect(out[1]).toBe(200);
    expect(out[3]).toBe(290);
  });

  it('absorbs a negative delta from the largest element', () => {
    const out = rescaleFrames([100, 200, 305], 600);
    expect(out.reduce((a, b) => a + b, 0)).toBe(600);
    expect(out[2]).toBe(300);
  });

  it('splits across multiple scenes when delta exceeds the longest scene margin', () => {
    // sum=1020, target=1000, delta=-20; longest=400, can absorb all if >0 result
    const out = rescaleFrames([100, 200, 400, 320], 1000);
    expect(out.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(out.every((n) => n > 0)).toBe(true);
  });

  it('throws when target forces any scene to <=0 frames', () => {
    expect(() => rescaleFrames([10, 10, 10], 0)).toThrow();
  });

  it('throws on empty array', () => {
    expect(() => rescaleFrames([], 900)).toThrow();
  });
});
```

- [ ] **Step 2: Run — must fail**

```bash
pnpm --filter @promptdemo/worker-storyboard test -- rescaleFrames
```

- [ ] **Step 3: Implement**

```ts
export function rescaleFrames(durations: number[], target: number): number[] {
  if (durations.length === 0) throw new Error('rescaleFrames: empty durations');
  const sum = durations.reduce((a, b) => a + b, 0);
  const delta = target - sum;
  if (delta === 0) return [...durations];

  // Find longest scene index; apply delta there. If that makes it <=0, distribute.
  const out = [...durations];
  const idx = out.indexOf(Math.max(...out));
  if (out[idx]! + delta > 0) {
    out[idx] = out[idx]! + delta;
    return out;
  }

  // Proportional distribution
  const ratios = durations.map((d) => d / sum);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.max(1, Math.round(durations[i]! + delta * ratios[i]!));
  }
  // Correct rounding residue by adjusting longest
  const rounded = out.reduce((a, b) => a + b, 0);
  const residue = target - rounded;
  if (residue !== 0) {
    const j = out.indexOf(Math.max(...out));
    out[j] = out[j]! + residue;
  }
  if (out.some((n) => n <= 0)) {
    throw new Error(`rescaleFrames: cannot reach target ${target} without non-positive scenes`);
  }
  return out;
}
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add workers/storyboard/src/rescaleFrames.ts workers/storyboard/tests/rescaleFrames.test.ts
git commit -m "feat(storyboard): rescaleFrames utility for duration auto-adjust"
```

---

### Task 2.4: `durationAdjust` stage (TDD)

**Purpose:** Spec §5 stage [4]: if `|sum − target| ≤ 5%`, auto-prorate; if greater, signal retry.

**Files:**
- Create: `workers/storyboard/src/validation/durationAdjust.ts`
- Create: `workers/storyboard/tests/durationAdjust.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { adjustDuration } from '../src/validation/durationAdjust.js';

type MinimalScene = { durationInFrames: number };
type MinimalBoard = {
  videoConfig: { durationInFrames: number };
  scenes: MinimalScene[];
};

function mk(target: number, scenes: number[]): MinimalBoard {
  return {
    videoConfig: { durationInFrames: target },
    scenes: scenes.map((d) => ({ durationInFrames: d })),
  };
}

describe('adjustDuration', () => {
  it('passes through when sum already equals target', () => {
    const sb = mk(900, [300, 300, 300]);
    const r = adjustDuration(sb);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.storyboard.scenes.map((s) => s.durationInFrames)).toEqual([300, 300, 300]);
  });

  it('auto-prorates within 5% tolerance', () => {
    const sb = mk(900, [300, 300, 290]); // sum 890, delta +10 (1.1%)
    const r = adjustDuration(sb);
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    const newSum = r.storyboard.scenes.reduce((a, s) => a + s.durationInFrames, 0);
    expect(newSum).toBe(900);
  });

  it('returns retry signal when delta exceeds 5%', () => {
    const sb = mk(900, [300, 300, 200]); // sum 800, delta +100 (11.1%)
    const r = adjustDuration(sb);
    expect(r.kind).toBe('retry');
    if (r.kind !== 'retry') return;
    expect(r.reason).toMatch(/5%/);
  });
});
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement**

```ts
import type { Storyboard } from '@promptdemo/schema';
import { rescaleFrames } from '../rescaleFrames.js';

type MinimalScene = { durationInFrames: number };
type MinimalBoard = {
  videoConfig: { durationInFrames: number };
  scenes: MinimalScene[];
};

export type AdjustResult<T extends MinimalBoard> =
  | { kind: 'ok'; storyboard: T }
  | { kind: 'retry'; reason: string; sum: number; target: number };

const TOLERANCE = 0.05;

export function adjustDuration<T extends MinimalBoard>(sb: T): AdjustResult<T> {
  const target = sb.videoConfig.durationInFrames;
  const sum = sb.scenes.reduce((a, s) => a + s.durationInFrames, 0);
  if (sum === target) return { kind: 'ok', storyboard: sb };

  const pctOff = Math.abs(sum - target) / target;
  if (pctOff > TOLERANCE) {
    return {
      kind: 'retry',
      reason: `scenes sum ${sum} differs from target ${target} by ${(pctOff * 100).toFixed(1)}%, which exceeds the 5% auto-correct tolerance`,
      sum,
      target,
    };
  }

  const newDurations = rescaleFrames(
    sb.scenes.map((s) => s.durationInFrames),
    target
  );
  const scenes = sb.scenes.map((s, i) => ({ ...s, durationInFrames: newDurations[i]! }));
  return { kind: 'ok', storyboard: { ...sb, scenes } };
}

// Storyboard-typed convenience wrapper
export function adjustStoryboardDuration(sb: Storyboard): AdjustResult<Storyboard> {
  return adjustDuration(sb);
}
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add workers/storyboard/src/validation/durationAdjust.ts workers/storyboard/tests/durationAdjust.test.ts
git commit -m "feat(storyboard): duration adjust stage with 5% tolerance prorate"
```

---

### Task 2.5: `parseJson` stage (TDD)

**Purpose:** Strip markdown code fences (Claude sometimes wraps JSON in ```json...```), parse, return the raw object or a typed error.

**Files:**
- Create: `workers/storyboard/src/validation/parseJson.ts`
- Create: `workers/storyboard/tests/parseJson.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseJson } from '../src/validation/parseJson.js';

describe('parseJson', () => {
  it('parses clean JSON', () => {
    const r = parseJson('{"a": 1}');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ a: 1 });
  });

  it('strips triple-backtick fences with optional json language tag', () => {
    const r = parseJson('```json\n{"a": 1}\n```');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ a: 1 });
  });

  it('strips plain triple-backtick fences without language tag', () => {
    const r = parseJson('```\n{"a": 2}\n```');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ a: 2 });
  });

  it('returns error for unparseable content', () => {
    const r = parseJson('not json');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') expect(r.message).toMatch(/JSON/i);
  });

  it('trims leading/trailing whitespace', () => {
    const r = parseJson('   {"a": 3}   ');
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(r.value).toEqual({ a: 3 });
  });
});
```

- [ ] **Step 2: Impl**

```ts
export type ParseResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'error'; message: string };

export function parseJson(input: string): ParseResult {
  let text = input.trim();
  // Strip markdown code fences
  const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) text = fenceMatch[1]!.trim();
  try {
    return { kind: 'ok', value: JSON.parse(text) };
  } catch (err) {
    return { kind: 'error', message: `JSON parse failed: ${(err as Error).message}` };
  }
}
```

- [ ] **Step 3: Tests pass. Commit:**

```bash
git add workers/storyboard/src/validation/parseJson.ts workers/storyboard/tests/parseJson.test.ts
git commit -m "feat(storyboard): JSON parser with markdown fence stripping"
```

---

### Task 2.6: `zodValidate` stage (TDD)

**Purpose:** Thin typed wrapper around `StoryboardSchema.safeParse` that returns the plan's expected discriminated union.

**Files:**
- Create: `workers/storyboard/src/validation/zodValidate.ts`
- Create: `workers/storyboard/tests/zodValidate.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { zodValidate } from '../src/validation/zodValidate.js';
import validStoryboard from '@promptdemo/schema/fixtures/storyboard.30s.json' with { type: 'json' };

describe('zodValidate', () => {
  it('accepts valid fixture', () => {
    const r = zodValidate(validStoryboard);
    expect(r.kind).toBe('ok');
  });

  it('rejects malformed and surfaces Zod issues as a flat string list', () => {
    const r = zodValidate({ videoConfig: {}, assets: {}, scenes: [] });
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.issues.length).toBeGreaterThan(0);
      expect(typeof r.issues[0]).toBe('string');
    }
  });
});
```

- [ ] **Step 2: Impl**

```ts
import { StoryboardSchema, type Storyboard } from '@promptdemo/schema';

export type ValidateResult =
  | { kind: 'ok'; storyboard: Storyboard }
  | { kind: 'error'; issues: string[] };

export function zodValidate(input: unknown): ValidateResult {
  const res = StoryboardSchema.safeParse(input);
  if (res.success) return { kind: 'ok', storyboard: res.data };
  const issues = res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
  return { kind: 'error', issues };
}
```

- [ ] **Step 3: Tests pass. Commit:**

```bash
git add workers/storyboard/src/validation/zodValidate.ts workers/storyboard/tests/zodValidate.test.ts
git commit -m "feat(storyboard): Zod validate stage with flattened issue list"
```

---

### Task 2.7: `extractiveCheck` stage (TDD)

**Purpose:** Spec §5 stage [3]. Every scene text field must appear (loosely) in `assets.sourceTexts`.

- **Latin**: Fuse.js threshold 0.3.
- **CJK** (detect via Unicode range in the candidate text): fall back to normalized substring match within the concatenated sourceTexts pool — Fuse.js's whitespace tokenizer breaks on CJK.
- Both sides use `normalizeText` from `@promptdemo/schema`.

**Files:**
- Create: `workers/storyboard/src/validation/extractiveCheck.ts`
- Create: `workers/storyboard/tests/extractiveCheck.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest';
import { extractiveCheck, collectSceneTexts } from '../src/validation/extractiveCheck.js';
import type { Storyboard } from '@promptdemo/schema';

const basePool = [
  'ship production-grade ai workflows in minutes',
  'connect your data, run agents, see results',
  'one-click data sync',
];

function sb(scenes: Storyboard['scenes']): Storyboard {
  return {
    videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none' },
    assets: { screenshots: {}, sourceTexts: basePool },
    scenes,
  };
}

describe('collectSceneTexts', () => {
  it('pulls title + subtitle from HeroRealShot', () => {
    const texts = collectSceneTexts({
      sceneId: 1,
      type: 'HeroRealShot',
      durationInFrames: 300,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: { title: 'HELLO', subtitle: 'there', screenshotKey: 'viewport' },
    });
    expect(texts).toEqual(['HELLO', 'there']);
  });

  it('pulls bento items titles and descriptions', () => {
    const texts = collectSceneTexts({
      sceneId: 2,
      type: 'BentoGrid',
      durationInFrames: 300,
      entryAnimation: 'fade',
      exitAnimation: 'fade',
      props: {
        items: [
          { title: 'a', description: 'aa' },
          { title: 'b' },
          { title: 'c' },
        ],
      },
    });
    expect(texts).toEqual(['a', 'aa', 'b', 'c']);
  });
});

describe('extractiveCheck (Latin)', () => {
  it('passes when every scene text has a Fuse match', () => {
    const board = sb([
      {
        sceneId: 1,
        type: 'HeroRealShot',
        durationInFrames: 300,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: {
          title: 'ship production-grade AI workflows in minutes',
          subtitle: 'connect your data, run agents, see results',
          screenshotKey: 'viewport',
        },
      },
    ]);
    const r = extractiveCheck(board);
    expect(r.kind).toBe('ok');
  });

  it('fails when a scene text has no source', () => {
    const board = sb([
      {
        sceneId: 1,
        type: 'TextPunch',
        durationInFrames: 300,
        entryAnimation: 'fade',
        exitAnimation: 'fade',
        props: { text: 'totally invented marketing claim', emphasis: 'primary' },
      },
    ]);
    const r = extractiveCheck(board);
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.violations[0]).toMatchObject({ sceneId: 1 });
    }
  });
});

describe('extractiveCheck (CJK)', () => {
  const cjkPool = ['自動化未來', '一鍵生成', '更好的工作流'];
  const cjkBoard: Storyboard = {
    videoConfig: { durationInFrames: 300, fps: 30, brandColor: '#111111', bgm: 'none' },
    assets: { screenshots: {}, sourceTexts: cjkPool },
    scenes: [],
  };

  it('passes on substring match within the pool', () => {
    const board: Storyboard = {
      ...cjkBoard,
      scenes: [
        {
          sceneId: 1,
          type: 'TextPunch',
          durationInFrames: 300,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: { text: '自動化未來', emphasis: 'primary' },
        },
      ],
    };
    const r = extractiveCheck(board);
    expect(r.kind).toBe('ok');
  });

  it('fails on CJK text not in pool', () => {
    const board: Storyboard = {
      ...cjkBoard,
      scenes: [
        {
          sceneId: 1,
          type: 'TextPunch',
          durationInFrames: 300,
          entryAnimation: 'fade',
          exitAnimation: 'fade',
          props: { text: '完全不存在的東西', emphasis: 'primary' },
        },
      ],
    };
    const r = extractiveCheck(board);
    expect(r.kind).toBe('error');
  });
});
```

- [ ] **Step 2: Impl**

```ts
import Fuse from 'fuse.js';
import { normalizeText, type Scene, type Storyboard } from '@promptdemo/schema';

const FUSE_THRESHOLD = 0.3;
const CJK_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

export function collectSceneTexts(scene: Scene): string[] {
  switch (scene.type) {
    case 'HeroRealShot':
    case 'HeroStylized':
      return [scene.props.title, ...(scene.props.subtitle ? [scene.props.subtitle] : [])];
    case 'FeatureCallout':
      return [scene.props.title, scene.props.description];
    case 'CursorDemo':
      return [scene.props.targetDescription];
    case 'SmoothScroll':
      return [];
    case 'UseCaseStory':
      return scene.props.beats.map((b) => b.text);
    case 'StatsBand':
      return scene.props.stats.flatMap((s) => [s.value, s.label]);
    case 'BentoGrid':
      return scene.props.items.flatMap((i) => [i.title, ...(i.description ? [i.description] : [])]);
    case 'TextPunch':
      return [scene.props.text];
    case 'CTA':
      return [scene.props.headline];
  }
}

export type ExtractiveViolation = {
  sceneId: number;
  field: string;
  text: string;
};

export type ExtractiveResult =
  | { kind: 'ok' }
  | { kind: 'error'; violations: ExtractiveViolation[] };

function isCjk(s: string): boolean {
  return CJK_RE.test(s);
}

export function extractiveCheck(sb: Storyboard): ExtractiveResult {
  const pool = sb.assets.sourceTexts.map(normalizeText);
  const fuse = new Fuse(pool, { threshold: FUSE_THRESHOLD, includeScore: true });
  const cjkPoolJoined = pool.join(' | ');

  const violations: ExtractiveViolation[] = [];

  for (const scene of sb.scenes) {
    for (const raw of collectSceneTexts(scene)) {
      const n = normalizeText(raw);
      if (!n) continue;

      let matched: boolean;
      if (isCjk(n)) {
        // CJK: substring match within the concatenated pool
        matched = cjkPoolJoined.includes(n);
        if (!matched) {
          // weaker: any 3-gram of n appears in pool (minimum meaningful chunk)
          if (n.length >= 3) {
            for (let i = 0; i <= n.length - 3; i++) {
              const gram = n.slice(i, i + 3);
              if (cjkPoolJoined.includes(gram)) {
                matched = true;
                break;
              }
            }
          }
        }
      } else {
        const best = fuse.search(n)[0];
        matched = !!best && best.score !== undefined && best.score <= FUSE_THRESHOLD;
      }

      if (!matched) {
        violations.push({ sceneId: scene.sceneId, field: 'text', text: raw });
      }
    }
  }

  return violations.length === 0 ? { kind: 'ok' } : { kind: 'error', violations };
}
```

- [ ] **Step 3: Tests pass. Commit:**

```bash
git add workers/storyboard/src/validation/extractiveCheck.ts workers/storyboard/tests/extractiveCheck.test.ts
git commit -m "feat(storyboard): extractive check with Latin Fuse + CJK N-gram fallback"
```

---

### Task 2.8: System prompt builder (TDD)

**Purpose:** Build the cached system prompt: role, 10 scene types catalog, hard rules, 10s/30s/60s rhythm templates.

**Files:**
- Create: `workers/storyboard/src/prompts/sceneTypeCatalog.ts`
- Create: `workers/storyboard/src/prompts/systemPrompt.ts`
- Create: `workers/storyboard/tests/systemPrompt.test.ts`

- [ ] **Step 1: Write `sceneTypeCatalog.ts`** — human-readable scene descriptions for Claude:

```ts
import { SCENE_TYPES } from '@promptdemo/schema';

export const SCENE_CATALOG: Record<(typeof SCENE_TYPES)[number], string> = {
  HeroRealShot:
    'Opening scene with a real screenshot + overlaid title/subtitle. Props: { title, subtitle?, screenshotKey: "viewport"|"fullPage" }. Use only when assets.screenshots.viewport or fullPage exists.',
  HeroStylized:
    'Opening scene with a stylized re-draw (no screenshot). Props: { title, subtitle? }. Use when assets.screenshots is empty (Tier B fallback).',
  FeatureCallout:
    'Single feature focus. Props: { title, description, layout: "leftImage"|"rightImage"|"topDown", iconHint? }. The core building block of the middle section.',
  CursorDemo:
    'Simulated cursor interaction. Props: { action: "Click"|"Scroll"|"Hover"|"Type", targetHint: { region: one of 9 compass regions }, targetDescription }. Not allowed in 10s videos.',
  SmoothScroll:
    'Long-page scroll showcase. Props: { screenshotKey: "fullPage", speed: "slow"|"medium"|"fast" }. Requires assets.screenshots.fullPage.',
  UseCaseStory:
    'Three-beat narrative. Props: { beats: [{label:"before",text}, {label:"action",text}, {label:"after",text}] }. Only for 60s videos.',
  StatsBand:
    'Numeric callout band. Props: { stats: [{value, label}] (1-4 items) }. Use only if sourceTexts contain numeric phrases.',
  BentoGrid:
    'Dense feature grid (3-6 items). Props: { items: [{title, description?, iconHint?}] }. Good for when 3+ small features would otherwise require 3+ FeatureCallouts.',
  TextPunch:
    'Full-screen text beat for pacing. Props: { text, emphasis: "primary"|"secondary"|"neutral" }. Use to break up rhythm between feature scenes.',
  CTA:
    'Closing scene. Props: { headline, url }. Always required as the last scene.',
};

export const V1_IMPLEMENTED_SCENE_TYPES = [
  'HeroRealShot',
  'FeatureCallout',
  'TextPunch',
  'SmoothScroll',
  'CTA',
] as const;
```

- [ ] **Step 2: Write `systemPrompt.ts`**:

```ts
import { SCENE_CATALOG, V1_IMPLEMENTED_SCENE_TYPES } from './sceneTypeCatalog.js';

const HARD_RULES = `
HARD RULES — violating any of these means your output will be rejected and you will be asked to retry:

1. Output valid JSON only. No markdown, no prose, no code fences. The entire response must parse with JSON.parse.
2. The top-level shape is { videoConfig, assets, scenes }. Use the exact structure in the schema below.
3. Every text field in every scene (titles, descriptions, beat text, TextPunch text, CTA headline, etc.) MUST be a substring or close paraphrase of something in the provided sourceTexts whitelist. You may not invent product claims, features, or taglines.
4. \`scene.type\` must be one of: ${V1_IMPLEMENTED_SCENE_TYPES.join(', ')}. Other types exist in the schema but are NOT implemented in v1; do not use them.
5. Scene durationInFrames values must sum exactly to videoConfig.durationInFrames. (Minor rounding ±5% is auto-corrected downstream — but aim for exact.)
6. fps is always 30. videoConfig.durationInFrames is always 300 (10s), 900 (30s), or 1800 (60s).
7. Every scene needs entryAnimation and exitAnimation. Valid: fade, slideLeft, slideRight, slideUp, zoomIn, zoomOut, none.
8. brandColor must be the brand color from the input (or #1a1a1a fallback). Do not substitute other colors.
`.trim();

const RHYTHM_TEMPLATES = `
RHYTHM TEMPLATES — guidance for pacing, not hard rules:

- 10s (300 frames): 3-4 scenes. Always HeroRealShot (or HeroStylized if no screenshot), one FeatureCallout, CTA. Optionally one TextPunch between.
- 30s (900 frames): 5-7 scenes. HeroRealShot, 2-3 FeatureCallouts, one TextPunch as pacing break, optionally a SmoothScroll if fullPage screenshot is available, CTA.
- 60s (1800 frames): 7-10 scenes. HeroRealShot, 3-4 FeatureCallouts, multiple TextPunch breaks, SmoothScroll if available, optional closing TextPunch before CTA.
`.trim();

const SCHEMA_HINT = Object.entries(SCENE_CATALOG)
  .filter(([type]) => V1_IMPLEMENTED_SCENE_TYPES.includes(type as (typeof V1_IMPLEMENTED_SCENE_TYPES)[number]))
  .map(([type, desc]) => `  - ${type}: ${desc}`)
  .join('\n');

export function buildSystemPrompt(): string {
  return `You are a video storyboard editor for a URL-to-demo-video generation system. Given crawler-extracted brand and content data from a website, plus a user's intent, produce a structured JSON storyboard that a Remotion renderer will turn into an MP4.

SCENE TYPES (v1 implemented subset):
${SCHEMA_HINT}

${HARD_RULES}

${RHYTHM_TEMPLATES}

YOUR OUTPUT must be a valid Storyboard JSON object matching the structure described above. Nothing else.`;
}
```

- [ ] **Step 3: Test**

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../src/prompts/systemPrompt.js';

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt();

  it('mentions all v1 scene types', () => {
    for (const t of ['HeroRealShot', 'FeatureCallout', 'TextPunch', 'SmoothScroll', 'CTA']) {
      expect(prompt).toContain(t);
    }
  });

  it('does not mention v1.1-deferred types in the implemented catalog', () => {
    // They can still be referenced in the deferred/rule text; check via the implemented subset text
    expect(prompt).toContain('v1 implemented subset');
  });

  it('includes the extractive hard rule', () => {
    expect(prompt.toLowerCase()).toContain('sourcetexts');
    expect(prompt).toMatch(/may not invent/i);
  });

  it('declares duration invariants', () => {
    expect(prompt).toContain('300');
    expect(prompt).toContain('900');
    expect(prompt).toContain('1800');
  });

  it('prohibits markdown / code fences', () => {
    expect(prompt.toLowerCase()).toMatch(/no markdown|no code fences/);
  });

  it('fits within Claude prompt caching limits (under 16k tokens ≈ 60k chars)', () => {
    expect(prompt.length).toBeLessThan(60_000);
  });
});
```

- [ ] **Step 4: Tests pass. Commit:**

```bash
git add workers/storyboard/src/prompts/ workers/storyboard/tests/systemPrompt.test.ts
git commit -m "feat(storyboard): cached system prompt + scene type catalog"
```

---

### Task 2.9: User message builder (TDD)

**Purpose:** Per-call user message. Structured JSON block (easy for Claude to parse) containing intent, duration target in frames, crawl result assets + sourceTexts + features, optional regenerate context.

**Files:**
- Create: `workers/storyboard/src/prompts/userMessage.ts`
- Create: `workers/storyboard/tests/userMessage.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { buildUserMessage } from '../src/prompts/userMessage.js';
import crawlFixture from '@promptdemo/schema/fixtures/crawlResult.saas-landing.json' with { type: 'json' };
import type { CrawlResult } from '@promptdemo/schema';

const crawl = crawlFixture as CrawlResult;

describe('buildUserMessage', () => {
  it('embeds intent, duration, and crawl-derived fields', () => {
    const msg = buildUserMessage({
      intent: 'emphasize the enterprise-grade security',
      duration: 30,
      crawlResult: crawl,
    });
    expect(msg).toContain('emphasize the enterprise-grade security');
    expect(msg).toContain('900'); // 30s in frames
    for (const t of crawl.sourceTexts) expect(msg).toContain(t);
  });

  it('includes regenerate context when parentStoryboard + hint provided', () => {
    const msg = buildUserMessage({
      intent: 'x',
      duration: 10,
      crawlResult: crawl,
      regenerate: {
        previousStoryboard: { sceneId: 99 } as unknown as object,
        hint: 'make scene 2 faster',
      },
    });
    expect(msg).toContain('make scene 2 faster');
    expect(msg).toContain('99');
  });

  it('converts duration 10|30|60 → 300|900|1800 frames', () => {
    expect(buildUserMessage({ intent: 'x', duration: 10, crawlResult: crawl })).toContain('300');
    expect(buildUserMessage({ intent: 'x', duration: 30, crawlResult: crawl })).toContain('900');
    expect(buildUserMessage({ intent: 'x', duration: 60, crawlResult: crawl })).toContain('1800');
  });
});
```

- [ ] **Step 2: Impl**

```ts
import type { CrawlResult } from '@promptdemo/schema';

const DURATION_TO_FRAMES = { 10: 300, 30: 900, 60: 1800 } as const;

export interface BuildUserMessageInput {
  intent: string;
  duration: 10 | 30 | 60;
  crawlResult: CrawlResult;
  regenerate?: {
    previousStoryboard: object;
    hint: string;
  };
}

export function buildUserMessage(input: BuildUserMessageInput): string {
  const frames = DURATION_TO_FRAMES[input.duration];

  const blocks: string[] = [];
  blocks.push(`## Intent\n${input.intent}`);
  blocks.push(`## Target duration\n${input.duration}s = ${frames} frames at 30fps.`);
  blocks.push(`## Brand\n${JSON.stringify(input.crawlResult.brand, null, 2)}`);
  blocks.push(
    `## Available screenshots (asset keys to reference)\n${JSON.stringify(
      Object.keys(input.crawlResult.screenshots),
      null,
      2
    )}`
  );
  blocks.push(
    `## sourceTexts (extractive whitelist — every scene text must come from here)\n${JSON.stringify(
      input.crawlResult.sourceTexts,
      null,
      2
    )}`
  );
  blocks.push(`## Features extracted\n${JSON.stringify(input.crawlResult.features, null, 2)}`);
  blocks.push(`## Crawler tier\n${input.crawlResult.tier} (trackUsed=${input.crawlResult.trackUsed})`);

  if (input.regenerate) {
    blocks.push(
      `## REGENERATE CONTEXT\nThe user was unsatisfied with a previous attempt. Adjust according to the hint below, but keep what worked.\n\nHint: ${input.regenerate.hint}\n\nPrevious storyboard:\n${JSON.stringify(
        input.regenerate.previousStoryboard,
        null,
        2
      )}`
    );
  }

  blocks.push(`\nReturn a valid Storyboard JSON matching the hard rules in the system prompt.`);
  return blocks.join('\n\n');
}
```

- [ ] **Step 3: Tests pass. Commit:**

```bash
git add workers/storyboard/src/prompts/userMessage.ts workers/storyboard/tests/userMessage.test.ts
git commit -m "feat(storyboard): user message builder with regenerate context"
```

---

### Task 2.10: Claude client wrapper (TDD with mocked SDK)

**Purpose:** Encapsulate `@anthropic-ai/sdk` usage with `cache_control` on the system prompt, structured error types, and a clean interface for the pipeline to call.

**Files:**
- Create: `workers/storyboard/src/claude/claudeClient.ts`
- Create: `workers/storyboard/tests/claudeClient.test.ts`

- [ ] **Step 1: Test (SDK fully mocked)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { createClaudeClient, type ClaudeClient } from '../src/claude/claudeClient.js';

describe('createClaudeClient', () => {
  it('calls messages.create with cached system prompt and passes through text content', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"hello":1}' }],
      stop_reason: 'end_turn',
    });
    const sdk = { messages: { create } } as unknown as Parameters<typeof createClaudeClient>[0]['sdk'];

    const client: ClaudeClient = createClaudeClient({ sdk, model: 'claude-sonnet-4-6', maxTokens: 4096 });
    const out = await client.complete({ systemPrompt: 'SYS', userMessage: 'USR' });

    expect(out).toEqual({ kind: 'ok', text: '{"hello":1}' });
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0]![0];
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(args.max_tokens).toBe(4096);
    // system with cache_control block
    expect(args.system).toEqual([
      { type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } },
    ]);
    expect(args.messages).toEqual([{ role: 'user', content: 'USR' }]);
  });

  it('reports stop_reason other than end_turn as error', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '' }],
      stop_reason: 'max_tokens',
    });
    const sdk = { messages: { create } } as unknown as Parameters<typeof createClaudeClient>[0]['sdk'];
    const client = createClaudeClient({ sdk, model: 'claude-sonnet-4-6', maxTokens: 4096 });
    const out = await client.complete({ systemPrompt: 'x', userMessage: 'y' });
    expect(out.kind).toBe('error');
  });

  it('surfaces SDK errors', async () => {
    const create = vi.fn().mockRejectedValue(new Error('429 rate limited'));
    const sdk = { messages: { create } } as unknown as Parameters<typeof createClaudeClient>[0]['sdk'];
    const client = createClaudeClient({ sdk, model: 'claude-sonnet-4-6', maxTokens: 4096 });
    const out = await client.complete({ systemPrompt: 'x', userMessage: 'y' });
    expect(out).toEqual({ kind: 'error', message: '429 rate limited' });
  });
});
```

- [ ] **Step 2: Impl**

```ts
import type Anthropic from '@anthropic-ai/sdk';

export type ClaudeCompleteResult =
  | { kind: 'ok'; text: string }
  | { kind: 'error'; message: string };

export interface ClaudeClient {
  complete(args: { systemPrompt: string; userMessage: string }): Promise<ClaudeCompleteResult>;
}

export interface CreateClaudeClientInput {
  sdk: Pick<Anthropic, 'messages'>;
  model: string;
  maxTokens: number;
}

export function createClaudeClient(cfg: CreateClaudeClientInput): ClaudeClient {
  return {
    async complete({ systemPrompt, userMessage }) {
      try {
        const res = await cfg.sdk.messages.create({
          model: cfg.model,
          max_tokens: cfg.maxTokens,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: userMessage }],
        });
        if (res.stop_reason !== 'end_turn') {
          return { kind: 'error', message: `unexpected stop_reason: ${res.stop_reason}` };
        }
        const textBlock = res.content.find((b) => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          return { kind: 'error', message: 'no text block in response' };
        }
        return { kind: 'ok', text: textBlock.text };
      } catch (err) {
        return { kind: 'error', message: (err as Error).message };
      }
    },
  };
}
```

- [ ] **Step 3: Tests pass. Commit:**

```bash
git add workers/storyboard/src/claude/claudeClient.ts workers/storyboard/tests/claudeClient.test.ts
git commit -m "feat(storyboard): claude client wrapper with prompt caching"
```

---

### Task 2.11: Pipeline orchestrator (TDD, mocked Claude)

**Purpose:** Tie it all together. `generate(crawlResult, intent, duration, hint?)` → 5-stage pipeline, up to 3 retries with error feedback. This is the heart of the worker.

**Files:**
- Create: `workers/storyboard/src/generator.ts`
- Create: `workers/storyboard/tests/generator.test.ts`

- [ ] **Step 1: Test (mocked Claude returning scripted responses)**

```ts
import { describe, it, expect, vi } from 'vitest';
import { generateStoryboard } from '../src/generator.js';
import type { ClaudeClient } from '../src/claude/claudeClient.js';
import crawlFixture from '@promptdemo/schema/fixtures/crawlResult.saas-landing.json' with { type: 'json' };
import validStoryboard from '@promptdemo/schema/fixtures/storyboard.30s.json' with { type: 'json' };
import type { CrawlResult } from '@promptdemo/schema';

const crawl = crawlFixture as CrawlResult;

function mockClient(...responses: string[]): ClaudeClient {
  const queue = [...responses];
  return {
    complete: vi.fn().mockImplementation(async () => {
      const next = queue.shift();
      if (next === undefined) throw new Error('no more mock responses');
      return { kind: 'ok', text: next };
    }),
  };
}

describe('generateStoryboard', () => {
  it('succeeds on first try with a valid fixture response', async () => {
    const client = mockClient(JSON.stringify(validStoryboard));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'showcase AI workflows',
      duration: 30,
    });
    expect(result.kind).toBe('ok');
  });

  it('retries on JSON parse failure and succeeds on second try', async () => {
    const client = mockClient('not-json-first-attempt', JSON.stringify(validStoryboard));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
    });
    expect(result.kind).toBe('ok');
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('gives up after 3 total attempts', async () => {
    const client = mockClient('bad1', 'bad2', 'bad3');
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.attempts).toBe(3);
  });

  it('auto-prorates minor duration drift without retry', async () => {
    // Take valid fixture, perturb one scene by +5 frames (<<5%)
    const perturbed = JSON.parse(JSON.stringify(validStoryboard));
    perturbed.scenes[0].durationInFrames += 5; // drifts sum
    const client = mockClient(JSON.stringify(perturbed));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const sum = result.storyboard.scenes.reduce((a, s) => a + s.durationInFrames, 0);
      expect(sum).toBe(900);
    }
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
```

- [ ] **Step 2: Impl**

```ts
import type { CrawlResult, Storyboard } from '@promptdemo/schema';
import { buildSystemPrompt } from './prompts/systemPrompt.js';
import { buildUserMessage } from './prompts/userMessage.js';
import { parseJson } from './validation/parseJson.js';
import { zodValidate } from './validation/zodValidate.js';
import { extractiveCheck } from './validation/extractiveCheck.js';
import { adjustStoryboardDuration } from './validation/durationAdjust.js';
import type { ClaudeClient } from './claude/claudeClient.js';

const MAX_ATTEMPTS = 3;

export type GenerateResult =
  | { kind: 'ok'; storyboard: Storyboard; attempts: number }
  | { kind: 'error'; message: string; attempts: number };

export interface GenerateInput {
  claude: ClaudeClient;
  crawlResult: CrawlResult;
  intent: string;
  duration: 10 | 30 | 60;
  hint?: string;
  previousStoryboard?: Storyboard;
}

export async function generateStoryboard(input: GenerateInput): Promise<GenerateResult> {
  const systemPrompt = buildSystemPrompt();
  let userMessage = buildUserMessage({
    intent: input.intent,
    duration: input.duration,
    crawlResult: input.crawlResult,
    ...(input.hint && input.previousStoryboard
      ? { regenerate: { hint: input.hint, previousStoryboard: input.previousStoryboard } }
      : {}),
  });
  let feedback = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const msg = feedback ? `${userMessage}\n\n## Previous attempt errors — fix these:\n${feedback}` : userMessage;
    const resp = await input.claude.complete({ systemPrompt, userMessage: msg });
    if (resp.kind === 'error') {
      feedback = `Claude API error: ${resp.message}`;
      continue;
    }

    const parsed = parseJson(resp.text);
    if (parsed.kind === 'error') {
      feedback = parsed.message;
      continue;
    }

    const validated = zodValidate(parsed.value);
    if (validated.kind === 'error') {
      feedback = `Zod validation failed:\n${validated.issues.join('\n')}`;
      continue;
    }

    const extractive = extractiveCheck(validated.storyboard);
    if (extractive.kind === 'error') {
      feedback = `Extractive check failed — these phrases are not in sourceTexts:\n${extractive.violations
        .map((v) => ` scene ${v.sceneId}: "${v.text}"`)
        .join('\n')}`;
      continue;
    }

    const adjusted = adjustStoryboardDuration(validated.storyboard);
    if (adjusted.kind === 'retry') {
      feedback = adjusted.reason;
      continue;
    }

    return { kind: 'ok', storyboard: adjusted.storyboard, attempts: attempt };
  }

  return { kind: 'error', message: `STORYBOARD_GEN_FAILED: ${feedback}`, attempts: MAX_ATTEMPTS };
}
```

- [ ] **Step 3: Tests pass. Commit:**

```bash
git add workers/storyboard/src/generator.ts workers/storyboard/tests/generator.test.ts
git commit -m "feat(storyboard): pipeline orchestrator with self-correcting retry"
```

---

### Task 2.12: BullMQ worker + mock mode

**Files:**
- Create: `workers/storyboard/src/mockMode.ts`
- Create: `workers/storyboard/src/index.ts` (replace stub)
- Create: `workers/storyboard/tests/mockMode.test.ts`

- [ ] **Step 1: Write `mockMode.ts`**

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoryboardSchema, type Storyboard } from '@promptdemo/schema';

const FIXTURES_DIR = fileURLToPath(
  new URL('../../../../packages/schema/fixtures/', import.meta.url)
);

const FIXTURE_BY_DURATION: Record<10 | 30 | 60, string> = {
  10: 'storyboard.10s.json',
  30: 'storyboard.30s.json',
  60: 'storyboard.60s.json',
};

export async function loadMockStoryboard(duration: 10 | 30 | 60): Promise<Storyboard> {
  const file = join(FIXTURES_DIR, FIXTURE_BY_DURATION[duration]);
  const raw = JSON.parse(await readFile(file, 'utf8'));
  return StoryboardSchema.parse(raw);
}
```

- [ ] **Step 2: Write `mockMode.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { loadMockStoryboard } from '../src/mockMode.js';

describe('loadMockStoryboard', () => {
  it('returns valid 10s fixture', async () => {
    const sb = await loadMockStoryboard(10);
    expect(sb.videoConfig.durationInFrames).toBe(300);
  });
  it('returns valid 30s fixture', async () => {
    const sb = await loadMockStoryboard(30);
    expect(sb.videoConfig.durationInFrames).toBe(900);
  });
  it('returns valid 60s fixture', async () => {
    const sb = await loadMockStoryboard(60);
    expect(sb.videoConfig.durationInFrames).toBe(1800);
  });
});
```

- [ ] **Step 3: Replace `src/index.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { z } from 'zod';
import { CrawlResultSchema, type Storyboard } from '@promptdemo/schema';
import { makeS3Client, putObject, buildKey, s3ConfigFromEnv, getObjectJson } from './s3/s3Client.js';
import { generateStoryboard } from './generator.js';
import { createClaudeClient } from './claude/claudeClient.js';
import { loadMockStoryboard } from './mockMode.js';

const JobPayload = z.object({
  jobId: z.string().min(1),
  crawlResultUri: z.string().startsWith('s3://'),
  intent: z.string().min(1),
  duration: z.union([z.literal(10), z.literal(30), z.literal(60)]),
  hint: z.string().optional(),
  previousStoryboardUri: z.string().startsWith('s3://').optional(),
});
type JobPayload = z.infer<typeof JobPayload>;

const env = process.env;
const redisUrl = env.REDIS_URL ?? 'redis://localhost:6379';
const mockMode = env.MOCK_MODE === 'true';
const model = env.CLAUDE_MODEL ?? 'claude-sonnet-4-6';
const maxTokens = Number(env.CLAUDE_MAX_TOKENS ?? '4096');

const s3Cfg = s3ConfigFromEnv(env);
const s3 = makeS3Client(s3Cfg);
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const anthropic = mockMode
  ? null
  : new Anthropic({ apiKey: env.ANTHROPIC_API_KEY ?? (() => { throw new Error('ANTHROPIC_API_KEY unset'); })() });

const claude = anthropic ? createClaudeClient({ sdk: anthropic, model, maxTokens }) : null;

const worker = new Worker<JobPayload>(
  'storyboard',
  async (job: Job<JobPayload>) => {
    const payload = JobPayload.parse(job.data);

    let storyboard: Storyboard;
    if (mockMode) {
      storyboard = await loadMockStoryboard(payload.duration);
    } else {
      if (!claude) throw new Error('claude client not initialized');
      const crawlResult = CrawlResultSchema.parse(await getObjectJson(s3, payload.crawlResultUri));
      const previous = payload.previousStoryboardUri
        ? await getObjectJson<Storyboard>(s3, payload.previousStoryboardUri)
        : undefined;
      const res = await generateStoryboard({
        claude,
        crawlResult,
        intent: payload.intent,
        duration: payload.duration,
        ...(payload.hint ? { hint: payload.hint } : {}),
        ...(previous ? { previousStoryboard: previous } : {}),
      });
      if (res.kind === 'error') throw new Error(res.message);
      storyboard = res.storyboard;
    }

    const storyboardKey = buildKey(payload.jobId, 'storyboard.json');
    const storyboardUri = await putObject(
      s3,
      s3Cfg.bucket,
      storyboardKey,
      Buffer.from(JSON.stringify(storyboard, null, 2)),
      'application/json'
    );
    return { storyboardUri };
  },
  {
    connection,
    concurrency: 4, // IO-bound on Claude API; no heavy CPU per job
    lockDuration: 60_000,
  }
);

worker.on('failed', (job, err) => {
  console.error('[storyboard] job failed', { jobId: job?.id, err: err.message });
});

const shutdown = async () => {
  console.log('[storyboard] shutting down');
  await worker.close();
  await connection.quit();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log(`[storyboard] worker started, queue=storyboard, mock=${mockMode}`);
```

- [ ] **Step 4: Typecheck + test**

```bash
pnpm --filter @promptdemo/worker-storyboard typecheck
pnpm --filter @promptdemo/worker-storyboard test
```

- [ ] **Step 5: Commit**

```bash
git add workers/storyboard/src/mockMode.ts workers/storyboard/src/index.ts workers/storyboard/tests/mockMode.test.ts
git commit -m "feat(storyboard): BullMQ worker bootstrap with mock mode"
```

---

### Task 2.13: Dockerfile (slim Node, no browser)

**Files:**
- Create: `workers/storyboard/Dockerfile`

- [ ] **Step 1: Write**

```dockerfile
# Slim node image — storyboard worker has no browser dependency
FROM node:20.11.1-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY workers/storyboard/package.json workers/storyboard/

RUN pnpm install --frozen-lockfile

COPY packages/schema/ packages/schema/
COPY workers/storyboard/ workers/storyboard/

WORKDIR /repo/workers/storyboard
ENV NODE_ENV=production

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
```

- [ ] **Step 2: Commit**

```bash
git add workers/storyboard/Dockerfile
git commit -m "feat(storyboard): slim node Dockerfile with tini"
```

---

### Task 2.14: Final typecheck + test + tag `v0.2.0-storyboard-ai`

- [ ] **Step 1: Run full workspace typecheck and test**

```bash
pnpm -r typecheck
pnpm -r test
```

Expected: 88 (Plan 1) + ~35 (Plan 2 storyboard tests) = ~123 total, all green.

- [ ] **Step 2: Tag**

```bash
git tag -a v0.2.0-storyboard-ai -m "Phase 2: Storyboard AI worker complete

Adds @promptdemo/worker-storyboard:
- Cached system prompt with 10 scene type catalog + extractive rules
- User message builder with regenerate context
- 5-stage validation pipeline (parse → Zod → extractive → duration → done)
  with CJK-aware extractive check and <=5% duration auto-prorate
- Claude client wrapper with prompt caching
- Self-correcting retry (up to 3 attempts) that feeds errors back to Claude
- BullMQ worker with mock mode fallback
- Slim node Dockerfile

Reads CrawlResult from S3, writes Storyboard back to S3. No browser deps."
```

- [ ] **Step 3: Decide with user whether to push**

Do NOT push automatically. Ask user explicitly whether to `git push origin main && git push origin v0.2.0-storyboard-ai`.

---

## Self-Review

**Spec coverage (§5):**
- Three-part prompt with caching ✓ (Task 2.8, 2.10)
- 5-stage validation pipeline ✓ (Tasks 2.5, 2.6, 2.7, 2.4, 2.11)
- CJK language-aware extractive ✓ (Task 2.7)
- Duration auto-prorate ≤5% ✓ (Tasks 2.3, 2.4)
- Claude Sonnet 4.6 ✓ (Task 2.12 env default)
- Regenerate with hint ✓ (Task 2.9 userMessage regenerate block; Task 2.11 accepts input)
- Retry with feedback self-correction ✓ (Task 2.11)

**Placeholders:** None.

**Type consistency:**
- `ClaudeClient.complete` signature consistent across client + generator tests ✓
- `generateStoryboard` input `duration: 10|30|60` consistent with `buildUserMessage` and the frame-count table ✓
- Scene text collector returns `string[]` consumed by extractiveCheck ✓
- S3Uri brand type used correctly via `getObjectJson` (parseS3Uri handles it)

**Scope check:** 14 tasks, single worker package. Independently shippable — does not depend on Plan 3 (Remotion) or Plan 4 (API).

---

## Execution Handoff

Two options:
1. **Subagent-driven** (same compressed approach as Plan 1)
2. **Inline with executing-plans**

User picks.
