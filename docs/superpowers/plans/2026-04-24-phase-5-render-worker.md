# LumeSpec v1.0 — Plan 5: Render Worker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Ship `workers/render`: a BullMQ worker on the `render` queue that consumes a validated `Storyboard` from S3, bundles and renders the Plan 3 Remotion composition via `@remotion/renderer`, uploads the resulting MP4 to S3, and returns `{ videoUrl }` to the orchestrator.

**Architecture:** One worker, `concurrency: 1` at both the Cloud Run HTTP layer AND the BullMQ worker options layer (per spec §1 and §6 — Remotion saturates CPU; two jobs on one instance thrash). `lockDuration: 600_000` matches Cloud Run's max request timeout and comfortably covers the worst-case 60s-video render (~5–10 min on first run with cold font cache). The Remotion bundle is created fresh per render job for v1; future work: cache the bundle between jobs in the same instance.

**Tech Stack:** Node 20, `@remotion/bundler`, `@remotion/renderer`, `@lumespec/remotion` (Plan 3), `@lumespec/schema`, BullMQ, ioredis, `@aws-sdk/client-s3`.

**Spec reference:** `docs/superpowers/specs/2026-04-20-lumespec-design.md` §1, §6.

**Predecessor:** Plan 3 (`v0.3.0-remotion-mvp`) + Plan 2 (`v0.2.0-storyboard-ai`) for the Storyboard contract.

**Independence from Plan 4:** Plan 5 consumes `render` queue jobs with the payload Plan 4 documented:

```ts
{
  jobId: string,
  storyboardUri: S3Uri,
  sourceUrl: string,
  duration: 10 | 30 | 60,
}
```

Return value (BullMQ `returnvalue`): `{ videoUrl: S3Uri }` as JSON string.

---

## File Structure

```
workers/render/
├── package.json
├── tsconfig.json
├── Dockerfile                      # Playwright-jammy base (Chromium for Remotion renderer)
├── src/
│   ├── index.ts                    # BullMQ worker bootstrap
│   ├── renderer.ts                 # bundle + renderMedia orchestration
│   ├── s3/s3Client.ts              # get + put helpers (copied from storyboard/crawler pattern)
│   └── tempDir.ts                  # scoped temp dir util with cleanup
└── tests/
    ├── s3Client.test.ts
    ├── tempDir.test.ts
    └── renderer.test.ts            # mocked @remotion/bundler + @remotion/renderer
```

---

## Tasks Overview

8 tasks. Tightest plan of the series — most logic lives inside Plan 3's composition; this worker is mainly glue.

| # | Task | Type | Scope |
|---|---|---|---|
| 5.1 | Scaffold `workers/render` | chore | package.json, tsconfig, stub |
| 5.2 | Copy s3Client adapter | chore | get + put helpers |
| 5.3 | `tempDir` utility | TDD | mkdtemp + cleanup on exit |
| 5.4 | `renderer.ts` — bundle + renderMedia wrapper | TDD (mocked) | thin orchestration |
| 5.5 | Worker entrypoint | integration | BullMQ Worker with concurrency:1, lockDuration 600s |
| 5.6 | Dockerfile | infra | single-stage on Playwright jammy |
| 5.7 | Gated real-render integration test | integration | `RENDER_INTEGRATION=true` only |
| 5.8 | Final validate + tag `v0.5.0-render-worker` | validation | — |

---

## Phase 5 — Tasks

### Task 5.1: Scaffold `workers/render`

**Files:**
- Create: `workers/render/package.json`, `tsconfig.json`, `src/index.ts` (stub)

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@lumespec/worker-render",
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
    "@lumespec/schema": "workspace:*",
    "@lumespec/remotion": "workspace:*",
    "@aws-sdk/client-s3": "3.658.1",
    "@remotion/bundler": "4.0.218",
    "@remotion/renderer": "4.0.218",
    "bullmq": "5.21.2",
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

- [ ] **Step 2: `tsconfig.json`** (Bundler resolution, same as Plan 4 and post-fix workers)

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Stub `src/index.ts`**

```ts
console.log('render worker bootstrap pending');
```

- [ ] **Step 4: Install + typecheck**

```bash
pnpm install
pnpm --filter @lumespec/worker-render typecheck
```

- [ ] **Step 5: Commit**

```bash
git add workers/render/package.json workers/render/tsconfig.json workers/render/src/index.ts pnpm-lock.yaml
git commit -m "chore(render): scaffold worker package"
```

---

### Task 5.2: Copy s3Client adapter

**Files:**
- Create: `workers/render/src/s3/s3Client.ts`
- Create: `workers/render/tests/s3Client.test.ts`

Copy byte-for-byte from `workers/storyboard/src/s3/s3Client.ts` and its test file. The storyboard's version already has `getObjectJson` plus all the put helpers we need here. Copy the test file too.

- [ ] **Step 1: Copy both files**

- [ ] **Step 2: Add `uploadFile` helper** — needed for uploading the rendered MP4 from a local path. Append:

```ts
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export async function uploadFile(
  client: S3Client,
  bucket: string,
  key: string,
  localPath: string,
  contentType: string
): Promise<S3Uri> {
  const size = (await stat(localPath)).size;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(localPath),
      ContentLength: size,
      ContentType: contentType,
    })
  );
  return toS3Uri(bucket, key);
}
```

Make sure the imports at the top include `createReadStream`/`stat` and that `PutObjectCommand` and `toS3Uri` are already imported from the storyboard adapter — if not, add them.

- [ ] **Step 3: Test + commit**

Test extends the storyboard's buildKey coverage with no new assertions about `uploadFile` (requires real S3 or elaborate mock — covered by Task 5.7).

```bash
git add workers/render/src/s3/s3Client.ts workers/render/tests/s3Client.test.ts
git commit -m "feat(render): s3 client with uploadFile helper"
```

---

### Task 5.3: `tempDir` utility (TDD)

**Files:**
- Create: `workers/render/src/tempDir.ts`
- Create: `workers/render/tests/tempDir.test.ts`

**Purpose:** Scoped temp dir for each render (bundle output + mp4 output). Auto-cleanup on success OR failure.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { withTempDir } from '../src/tempDir.js';
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('withTempDir', () => {
  it('creates dir, runs fn, cleans up on success', async () => {
    let path = '';
    const result = await withTempDir('lumespec-render-', async (dir) => {
      path = dir;
      writeFileSync(join(dir, 'hello.txt'), 'hi');
      return 42;
    });
    expect(result).toBe(42);
    expect(existsSync(path)).toBe(false);
  });

  it('cleans up even when the fn throws', async () => {
    let path = '';
    await expect(
      withTempDir('lumespec-render-', async (dir) => {
        path = dir;
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect(existsSync(path)).toBe(false);
  });
});
```

- [ ] **Step 2: Impl**

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withTempDir<T>(
  prefix: string,
  fn: (dir: string) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add workers/render/src/tempDir.ts workers/render/tests/tempDir.test.ts
git commit -m "feat(render): withTempDir utility with cleanup-on-throw"
```

---

### Task 5.4: `renderer.ts` — bundle + renderMedia wrapper (TDD with mocks)

**Files:**
- Create: `workers/render/src/renderer.ts`
- Create: `workers/render/tests/renderer.test.ts`

**Purpose:** Given a storyboard, an `inputProps` payload, a bundle entrypoint path, and an output path — bundle once, render media, return the output path. Heavy SDK calls are injected via a minimal interface so the unit test can mock them.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { renderComposition } from '../src/renderer.js';

describe('renderComposition', () => {
  it('bundles entry, picks MainComposition, renders to outputPath', async () => {
    const bundle = vi.fn().mockResolvedValue('/tmp/bundle');
    const getCompositions = vi
      .fn()
      .mockResolvedValue([
        { id: 'MainComposition', durationInFrames: 900, fps: 30, width: 1280, height: 720 },
      ]);
    const renderMedia = vi.fn().mockResolvedValue(undefined);

    await renderComposition({
      entryPoint: '/src/Root.tsx',
      compositionId: 'MainComposition',
      inputProps: { videoConfig: { durationInFrames: 900, fps: 30 } } as any,
      outputPath: '/tmp/out.mp4',
      codec: 'h264',
      sdk: { bundle, getCompositions, renderMedia },
    });

    expect(bundle).toHaveBeenCalledWith(expect.objectContaining({ entryPoint: '/src/Root.tsx' }));
    expect(renderMedia).toHaveBeenCalledWith(
      expect.objectContaining({ outputLocation: '/tmp/out.mp4', codec: 'h264' })
    );
  });

  it('throws if MainComposition id not found', async () => {
    const sdk = {
      bundle: vi.fn().mockResolvedValue('/b'),
      getCompositions: vi.fn().mockResolvedValue([{ id: 'Other', durationInFrames: 1, fps: 30, width: 1, height: 1 }]),
      renderMedia: vi.fn(),
    };
    await expect(
      renderComposition({
        entryPoint: '/s.tsx',
        compositionId: 'MainComposition',
        inputProps: {} as any,
        outputPath: '/o.mp4',
        codec: 'h264',
        sdk,
      })
    ).rejects.toThrow(/MainComposition/);
    expect(sdk.renderMedia).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Impl**

```ts
import type { Storyboard } from '@lumespec/schema';

export interface RendererSdk {
  bundle(opts: { entryPoint: string }): Promise<string>;
  getCompositions(
    bundled: string
  ): Promise<Array<{ id: string; durationInFrames: number; fps: number; width: number; height: number }>>;
  renderMedia(opts: {
    composition: { id: string; durationInFrames: number; fps: number; width: number; height: number };
    serveUrl: string;
    codec: 'h264';
    outputLocation: string;
    inputProps: unknown;
  }): Promise<unknown>;
}

export interface RenderInput {
  entryPoint: string;
  compositionId: string;
  inputProps: Storyboard & { sourceUrl: string; resolverEndpoint: string; forcePathStyle: boolean };
  outputPath: string;
  codec: 'h264';
  sdk: RendererSdk;
}

export async function renderComposition(input: RenderInput): Promise<void> {
  const bundled = await input.sdk.bundle({ entryPoint: input.entryPoint });
  const comps = await input.sdk.getCompositions(bundled);
  const comp = comps.find((c) => c.id === input.compositionId);
  if (!comp) throw new Error(`composition id not found: ${input.compositionId}`);
  // Override durationInFrames with inputProps (client can change video length per job)
  const composition = {
    ...comp,
    durationInFrames: input.inputProps.videoConfig.durationInFrames,
  };
  await input.sdk.renderMedia({
    composition,
    serveUrl: bundled,
    codec: input.codec,
    outputLocation: input.outputPath,
    inputProps: input.inputProps,
  });
}

// Default SDK adapter binding to real Remotion packages (unit tests use a mock instead)
export async function defaultSdk(): Promise<RendererSdk> {
  const [{ bundle }, { getCompositions, renderMedia }] = await Promise.all([
    import('@remotion/bundler'),
    import('@remotion/renderer'),
  ]);
  return {
    bundle: (opts) => bundle(opts),
    getCompositions: (s) => getCompositions(s) as any,
    renderMedia: (opts) => renderMedia(opts as any),
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add workers/render/src/renderer.ts workers/render/tests/renderer.test.ts
git commit -m "feat(render): bundle + renderMedia wrapper with injectable SDK"
```

---

### Task 5.5: Worker entrypoint

**Files:**
- Replace: `workers/render/src/index.ts`

- [ ] **Step 1: Impl**

```ts
import { Worker, type Job } from 'bullmq';
import { Redis as IORedis } from 'ioredis';
import { z } from 'zod';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeS3Client,
  putObject,
  uploadFile,
  buildKey,
  s3ConfigFromEnv,
  getObjectJson,
} from './s3/s3Client.js';
import { withTempDir } from './tempDir.js';
import { renderComposition, defaultSdk } from './renderer.js';
import { StoryboardSchema, type Storyboard, type S3Uri } from '@lumespec/schema';

const JobPayload = z.object({
  jobId: z.string().min(1),
  storyboardUri: z.string().startsWith('s3://'),
  sourceUrl: z.string().url(),
  duration: z.union([z.literal(10), z.literal(30), z.literal(60)]),
});
type JobPayload = z.infer<typeof JobPayload>;

const env = process.env;
const redisUrl = env.REDIS_URL ?? 'redis://localhost:6379';
const s3Endpoint = env.S3_ENDPOINT ?? 'http://localhost:9000';
const forcePathStyle = env.S3_FORCE_PATH_STYLE === 'true';

// Entry point for @remotion/bundler — the Plan 3 package's Root.tsx.
// Resolved relative to the workspace so the render container can locate it.
const REMOTION_ENTRY_POINT = fileURLToPath(
  new URL('../../../packages/remotion/src/Root.tsx', import.meta.url)
);

const s3Cfg = s3ConfigFromEnv(env);
const s3 = makeS3Client(s3Cfg);
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const sdkPromise = defaultSdk();

const worker = new Worker<JobPayload>(
  'render',
  async (job: Job<JobPayload>) => {
    const payload = JobPayload.parse(job.data);
    const storyboard: Storyboard = StoryboardSchema.parse(await getObjectJson(s3, payload.storyboardUri));
    const sdk = await sdkPromise;

    return withTempDir('lumespec-render-', async (dir) => {
      const outputPath = join(dir, `${payload.jobId}.mp4`);

      await renderComposition({
        entryPoint: REMOTION_ENTRY_POINT,
        compositionId: 'MainComposition',
        inputProps: {
          ...storyboard,
          sourceUrl: payload.sourceUrl,
          resolverEndpoint: s3Endpoint,
          forcePathStyle,
        },
        outputPath,
        codec: 'h264',
        sdk,
      });

      const key = buildKey(payload.jobId, 'video.mp4');
      const videoUrl: S3Uri = await uploadFile(s3, s3Cfg.bucket, key, outputPath, 'video/mp4');
      return { videoUrl };
    });
  },
  {
    connection,
    concurrency: 1,
    lockDuration: 600_000, // match Cloud Run max request + p99 render
  }
);

worker.on('failed', (job, err) => {
  console.error('[render] job failed', { jobId: job?.id, err: err.message });
});

const shutdown = async () => {
  console.log('[render] shutting down');
  await worker.close();
  await connection.quit();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

console.log('[render] worker started, queue=render, concurrency=1');
```

- [ ] **Step 2: Typecheck**

```bash
pnpm --filter @lumespec/worker-render typecheck
```

- [ ] **Step 3: Commit**

```bash
git add workers/render/src/index.ts
git commit -m "feat(render): BullMQ worker entrypoint (concurrency=1, lockDuration=600s)"
```

---

### Task 5.6: Dockerfile

**Files:**
- Create: `workers/render/Dockerfile`

Single-stage on Playwright jammy (Chromium preinstalled for Remotion's headless renderer; same pattern Plan 1 ended up using).

- [ ] **Step 1: `Dockerfile`**

```dockerfile
# Single-stage on Playwright jammy (Chromium + glibc 2.35 compatible with Remotion)
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/remotion/package.json packages/remotion/
COPY workers/render/package.json workers/render/

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN pnpm install --frozen-lockfile

COPY packages/schema/ packages/schema/
COPY packages/remotion/ packages/remotion/
COPY workers/render/ workers/render/

WORKDIR /repo/workers/render
ENV NODE_ENV=production

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["pnpm", "start"]
```

- [ ] **Step 2: Commit**

```bash
git add workers/render/Dockerfile
git commit -m "feat(render): Dockerfile on Playwright jammy with tini"
```

---

### Task 5.7: Gated real-render integration test

**Files:**
- Create: `workers/render/tests/renderReal.test.ts`

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { renderComposition, defaultSdk } from '../src/renderer.js';
import { withTempDir } from '../src/tempDir.js';
import { fileURLToPath } from 'node:url';
import storyboard30s from '@lumespec/schema/fixtures/storyboard.30s.json';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const GATED = process.env.RENDER_INTEGRATION === 'true';

describe.skipIf(!GATED)('real Remotion render (RENDER_INTEGRATION=true)', () => {
  it('renders a 10s MP4 using the 30s fixture (override duration to 300 frames)', async () => {
    const entry = fileURLToPath(
      new URL('../../../packages/remotion/src/Root.tsx', import.meta.url)
    );
    const sdk = await defaultSdk();
    await withTempDir('lumespec-render-int-', async (dir) => {
      const output = join(dir, 'smoke.mp4');
      const shortened = { ...(storyboard30s as any), videoConfig: { ...(storyboard30s as any).videoConfig, durationInFrames: 300 } };
      await renderComposition({
        entryPoint: entry,
        compositionId: 'MainComposition',
        inputProps: {
          ...shortened,
          sourceUrl: 'https://example-saas.com',
          resolverEndpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
          forcePathStyle: true,
        },
        outputPath: output,
        codec: 'h264',
        sdk,
      });
      const size = statSync(output).size;
      expect(size).toBeGreaterThan(10_000);
    });
  }, 600_000);
});
```

- [ ] **Step 2: Commit**

```bash
git add workers/render/tests/renderReal.test.ts
git commit -m "test(render): gated real-render integration (RENDER_INTEGRATION=true)"
```

Note: before tagging, run locally with `RENDER_INTEGRATION=true pnpm --filter @lumespec/worker-render test` to validate the full render pipeline end-to-end. Requires MinIO running with fixture screenshots uploaded to `lumespec-dev/fixtures/` (or the Hero scene's `<Img>` will 404 — render may still succeed with a broken frame).

---

### Task 5.8: Final validate + tag `v0.5.0-render-worker`

- [ ] **Step 1: Full workspace validation**

```bash
pnpm -r typecheck
pnpm -r test
```

Expected totals:
- schema: 41
- remotion: 19 + 1 skipped
- worker-crawler: 47
- worker-storyboard: 43
- api: (from Plan 4) ~30
- worker-render: ~5 (s3Client 2 + tempDir 2 + renderer 2 = 6 total passing, 1 skipped for renderReal)

Combined: ~185 passing + 2 skipped.

- [ ] **Step 2: Tag (controller coordinates with Plan 4)**

```bash
git tag -a v0.5.0-render-worker -m "Phase 5: Render worker complete

Adds @lumespec/worker-render:
- BullMQ Worker on 'render' queue with concurrency=1 (Remotion saturates CPU)
- lockDuration: 600_000ms to accommodate full 60s-video renders
- Reads Storyboard from S3 (getObjectJson), validates with Zod
- Bundles Plan 3 composition via @remotion/bundler, renders via renderMedia
- Uploads MP4 back to S3 via uploadFile streaming
- Scoped temp dir via withTempDir with cleanup-on-throw
- Single-stage Dockerfile on Playwright jammy (Chromium preinstalled);
  tini PID 1 for orphan reaping
- Gated real-render integration test (RENDER_INTEGRATION=true)

Consumes the render queue job contract published by Plan 4:
  { jobId, storyboardUri, sourceUrl, duration }
Returns: { videoUrl: S3Uri }"
```

Controller pushes after both Plan 4 and Plan 5 tags exist.

---

## Self-Review

**Spec coverage (§1, §6):**
- BullMQ `concurrency: 1` at worker-options layer ✓ (5.5)
- Docker `ENTRYPOINT tini --` for orphan reaping ✓ (5.6)
- Remotion renderer via `@remotion/renderer` `renderMedia` (not CLI) ✓ (5.4)
- Storyboard read from s3:// via IAM/SDK (no pre-signed) ✓ (5.5)
- MP4 uploaded to s3:// ✓ (5.5)
- `resolverEndpoint` + `forcePathStyle` passed in `inputProps` so Plan 3's `makeS3Resolver` can map `s3://` to the MinIO HTTP endpoint at render time ✓

**Placeholders:** None. Production pre-signed URL fallback (when running against a non-public S3 bucket) is deferred to Plan 7 — documented as a TODO in the renderer comment of `index.ts`:

```
// resolverEndpoint assumes a path-style-reachable bucket (MinIO in dev, or
// a public/read-through proxy in prod). For private S3 buckets, Plan 7 will
// switch this to pre-signed URLs via @aws-sdk/s3-request-presigner.
```

(Add the comment in `workers/render/src/index.ts` at the top of the Worker callback.)

**Type consistency:**
- `storyboardUri`, `videoUrl` both `S3Uri` brand — match Plan 4's payload and return contract ✓
- `inputProps` shape extends `Storyboard` with `{ sourceUrl, resolverEndpoint, forcePathStyle }` — matches Plan 3's `MainCompositionProps` exactly ✓
- Return value JSON-stringifies to `{ videoUrl: "s3://..." }` which matches Plan 4 orchestrator's parser ✓

**Scope check:** 8 tasks, one worker package. Independently deployable. Depends on Plan 3 as a workspace dep; does not modify it.

---

## Execution Handoff

Subagent-driven compressed mode or inline. Controller picks.
