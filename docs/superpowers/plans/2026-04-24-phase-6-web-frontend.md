# PromptDemo v1.0 — Plan 6: Next.js Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Ship `apps/web`: a Next.js 14 App Router frontend that lets a user submit a URL + intent + duration, watch real-time progress via SSE, and view/download the rendered MP4. Minimal scope: one form page, one progress page, one regenerate flow.

**Architecture:** Next.js 14 App Router + TypeScript. Pages are server components by default; interactive pieces (`JobForm`, `JobStatus`, `VideoResult`) are client components. All API calls go to the Plan 4 backend via `NEXT_PUBLIC_API_BASE` (CORS is already enabled on the API). SSE uses the browser-native `EventSource` wrapped in a React hook. Styling via Tailwind CSS 3.4.

**Tech Stack:** Next.js 14.2, React 18.3, TypeScript, Tailwind CSS 3.4, Zod 3.23 (client-side validation), Vitest + @testing-library/react for component tests. No SSR fetches against the API — the app is effectively a single-page app shell with server-rendered HTML scaffolding; keeps deploy simple (no backend calls from Next.js server runtime).

**Spec reference:** `docs/superpowers/specs/2026-04-20-promptdemo-design.md` §3.

**Predecessor:** Plan 4 (`v0.4.0-api`). Plan 6 talks only to the REST + SSE API; it does not consume any worker package directly.

---

## File Structure

```
apps/web/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.example
├── Dockerfile
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # root layout + <html>/<body> + fonts
│   │   ├── page.tsx                   # home: hosts JobForm
│   │   ├── globals.css                # tailwind directives + theme vars
│   │   └── jobs/
│   │       └── [jobId]/
│   │           └── page.tsx           # progress page: hosts JobStatus
│   ├── components/
│   │   ├── JobForm.tsx                # client: URL + intent + duration form
│   │   ├── JobStatus.tsx              # client: SSE-connected progress view
│   │   ├── ProgressBar.tsx            # pure presentational
│   │   ├── StageLabel.tsx             # 'Crawling…' / 'Generating storyboard…' / 'Rendering…'
│   │   ├── VideoResult.tsx            # <video> player + download button
│   │   ├── RegenerateButton.tsx       # inline form that POSTs with parentJobId + hint
│   │   └── ErrorCard.tsx              # failure state
│   ├── lib/
│   │   ├── api.ts                     # typed fetchers for POST/GET
│   │   ├── types.ts                   # JobInput + Job types + Zod schemas (apps/web-local mirror)
│   │   ├── useJobStream.ts            # React hook wrapping EventSource
│   │   └── config.ts                  # reads NEXT_PUBLIC_API_BASE
└── tests/
    ├── lib/api.test.ts                # mocked fetch
    ├── lib/useJobStream.test.ts       # mocked EventSource
    ├── components/JobForm.test.tsx
    └── components/JobStatus.test.tsx
```

---

## Tasks Overview

11 tasks. Most UI components get component tests via jsdom + RTL. Pages themselves are shallow (host their respective client component) and are covered by integration-style runs during `pnpm dev`.

| # | Task | Type | Scope |
|---|---|---|---|
| 6.1 | Scaffold `apps/web` | chore | Next.js 14 + TS + Tailwind |
| 6.2 | `lib/types.ts` — API types mirror + Zod | TDD | JobInput + Job types |
| 6.3 | `lib/config.ts` + `lib/api.ts` | TDD (mocked fetch) | typed client |
| 6.4 | `lib/useJobStream.ts` SSE hook | TDD (mocked EventSource) | reducer-backed hook |
| 6.5 | `JobForm` component | TDD (RTL) | client form with client-side Zod validation |
| 6.6 | `ProgressBar` + `StageLabel` + `ErrorCard` + `VideoResult` | TDD (RTL) | presentational bits |
| 6.7 | `JobStatus` component | TDD (RTL, mocked hook) | composes the above by stream state |
| 6.8 | `RegenerateButton` + regenerate flow | TDD (RTL, mocked api) | inline form → new jobId → router push |
| 6.9 | Pages (`/` and `/jobs/[jobId]`) + layout + globals.css | integration | wire into app router |
| 6.10 | Dockerfile (Next.js standalone) | infra | slim image |
| 6.11 | Final validate + tag `v0.6.0-web` | validation | — |

---

## Phase 6 — Tasks

### Task 6.1: Scaffold `apps/web`

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/.env.example`
- Create: `apps/web/src/app/layout.tsx` (stub)
- Create: `apps/web/src/app/page.tsx` (stub)
- Create: `apps/web/src/app/globals.css`

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@promptdemo/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start -p 3001",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "14.2.15",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "6.6.3",
    "@testing-library/react": "16.0.1",
    "@testing-library/user-event": "14.5.2",
    "@types/node": "20.14.10",
    "@types/react": "18.3.11",
    "@types/react-dom": "18.3.0",
    "autoprefixer": "10.4.20",
    "jsdom": "25.0.1",
    "postcss": "8.4.47",
    "tailwindcss": "3.4.13",
    "typescript": "5.5.4",
    "vitest": "2.1.1",
    "@vitejs/plugin-react": "4.3.2"
  }
}
```

Note: this package does NOT depend on `@promptdemo/schema` (would pull bundler-incompatible upstream chain). It mirrors the tiny subset of Job types it needs locally.

- [ ] **Step 2: `tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "rootDir": ".",
    "outDir": ".next",
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["next-env.d.ts", "src/**/*", "tests/**/*"],
  "exclude": ["node_modules", ".next"]
}
```

- [ ] **Step 3: `next.config.mjs`**

```mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
};

export default nextConfig;
```

- [ ] **Step 4: `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          500: '#6d28d9',
          700: '#5b21b6',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 5: `postcss.config.mjs`**

```mjs
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: `.env.example`**

```
NEXT_PUBLIC_API_BASE=http://localhost:3000
```

- [ ] **Step 7: Stub pages + layout**

`src/app/layout.tsx`:
```tsx
import './globals.css';

export const metadata = {
  title: 'PromptDemo',
  description: 'Turn any URL into a demo video',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main>scaffold pending</main>;
}
```

`src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #ffffff;
  --foreground: #0f172a;
}

body {
  color: var(--foreground);
  background: var(--background);
  font-family: system-ui, sans-serif;
}
```

- [ ] **Step 8: Install + typecheck**

```bash
pnpm install
pnpm --filter @promptdemo/web typecheck
```

Note: Next.js generates `next-env.d.ts` on first `next build` or `next dev`. Typecheck may complain. If so, create an empty `apps/web/next-env.d.ts` with `/// <reference types="next" />`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/ pnpm-lock.yaml
git commit -m "chore(web): scaffold Next.js 14 app with Tailwind"
```

No push.

---

### Task 6.2: `lib/types.ts` — API types mirror (TDD)

**Files:**
- Create: `apps/web/src/lib/types.ts`
- Create: `apps/web/tests/lib/types.test.ts`

**Purpose:** Local Zod schemas mirroring the subset of `@promptdemo/api`'s Job/JobInput contract this app needs. Keeps the web bundle independent of the API package (which has Node-only deps).

- [ ] **Step 1: Test**

```ts
import { describe, it, expect } from 'vitest';
import { JobInputSchema, JobSchema, type Job } from '../../src/lib/types';

describe('JobInputSchema', () => {
  it('accepts 10/30/60 duration', () => {
    for (const d of [10, 30, 60] as const) {
      expect(JobInputSchema.safeParse({ url: 'https://x.com', intent: 'x', duration: d }).success).toBe(true);
    }
  });

  it('rejects bad URL', () => {
    expect(JobInputSchema.safeParse({ url: 'not a url', intent: 'x', duration: 10 }).success).toBe(false);
  });

  it('rejects empty intent', () => {
    expect(JobInputSchema.safeParse({ url: 'https://x.com', intent: '', duration: 10 }).success).toBe(false);
  });

  it('accepts optional parentJobId + hint', () => {
    const r = JobInputSchema.safeParse({
      url: 'https://x.com',
      intent: 'x',
      duration: 10,
      parentJobId: 'j1',
      hint: 'faster',
    });
    expect(r.success).toBe(true);
  });
});

describe('JobSchema', () => {
  const base = {
    jobId: 'j1',
    status: 'queued',
    stage: null,
    progress: 0,
    input: { url: 'https://x.com', intent: 'x', duration: 30 },
    fallbacks: [],
    createdAt: 1,
    updatedAt: 1,
  };

  it('accepts queued job', () => {
    expect(JobSchema.safeParse(base).success).toBe(true);
  });

  it('accepts done with videoUrl', () => {
    const r = JobSchema.safeParse({
      ...base,
      status: 'done',
      progress: 100,
      videoUrl: 's3://bucket/v.mp4',
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown status', () => {
    expect(JobSchema.safeParse({ ...base, status: 'weird' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Impl**

```ts
import { z } from 'zod';

export const JobInputSchema = z.object({
  url: z.string().url(),
  intent: z.string().min(1).max(500),
  duration: z.union([z.literal(10), z.literal(30), z.literal(60)]),
  parentJobId: z.string().min(1).optional(),
  hint: z.string().min(1).max(500).optional(),
});
export type JobInput = z.infer<typeof JobInputSchema>;

export const JobStatusSchema = z.enum([
  'queued',
  'crawling',
  'generating',
  'waiting_render_slot',
  'rendering',
  'done',
  'failed',
]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

const JobStageSchema = z.enum(['crawl', 'storyboard', 'render']).nullable();

const FallbackSchema = z.object({
  field: z.string(),
  reason: z.string(),
  replacedWith: z.string(),
});

const ErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean(),
});

export const JobSchema = z.object({
  jobId: z.string(),
  parentJobId: z.string().optional(),
  status: JobStatusSchema,
  stage: JobStageSchema,
  progress: z.number().int().min(0).max(100),
  input: JobInputSchema,
  crawlResultUri: z.string().startsWith('s3://').optional(),
  storyboardUri: z.string().startsWith('s3://').optional(),
  videoUrl: z.string().startsWith('s3://').optional(),
  fallbacks: z.array(FallbackSchema),
  error: ErrorSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Job = z.infer<typeof JobSchema>;
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/tests/lib/types.test.ts
git commit -m "feat(web): Job + JobInput Zod schemas mirroring API contract"
```

---

### Task 6.3: `lib/config.ts` + `lib/api.ts` (TDD with mocked fetch)

**Files:**
- Create: `apps/web/src/lib/config.ts`
- Create: `apps/web/src/lib/api.ts`
- Create: `apps/web/tests/lib/api.test.ts`

- [ ] **Step 1: `config.ts`**

```ts
export const API_BASE: string =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE) ||
  'http://localhost:3000';
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createJob, getJob, streamUrl } from '../../src/lib/api';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('createJob', () => {
  it('POSTs the input and returns jobId on 201', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 201,
      ok: true,
      json: async () => ({ jobId: 'abc' }),
    }) as any;
    const res = await createJob(
      { url: 'https://x.com', intent: 'x', duration: 30 },
      'http://api'
    );
    expect(res).toEqual({ jobId: 'abc' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://api/api/jobs',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('throws on non-2xx', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 400,
      ok: false,
      json: async () => ({ error: 'bad' }),
    }) as any;
    await expect(
      createJob({ url: 'https://x.com', intent: 'x', duration: 10 }, 'http://api')
    ).rejects.toThrow(/400/);
  });
});

describe('getJob', () => {
  it('fetches and parses a Job', async () => {
    const job = {
      jobId: 'j',
      status: 'queued',
      stage: null,
      progress: 0,
      input: { url: 'https://x.com', intent: 'x', duration: 30 },
      fallbacks: [],
      createdAt: 1,
      updatedAt: 1,
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => job,
    }) as any;
    const r = await getJob('j', 'http://api');
    expect(r.jobId).toBe('j');
  });

  it('throws on 404', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }) as any;
    await expect(getJob('j', 'http://api')).rejects.toThrow(/404/);
  });
});

describe('streamUrl', () => {
  it('builds a stream URL', () => {
    expect(streamUrl('j1', 'http://api')).toBe('http://api/api/jobs/j1/stream');
  });
});
```

- [ ] **Step 3: `api.ts`**

```ts
import { JobSchema, JobInputSchema, type Job, type JobInput } from './types';

export async function createJob(input: JobInput, apiBase: string): Promise<{ jobId: string }> {
  const parsed = JobInputSchema.parse(input);
  const res = await fetch(`${apiBase}/api/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(parsed),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`POST /api/jobs failed: ${res.status} ${JSON.stringify(body)}`);
  }
  const json = (await res.json()) as { jobId: string };
  return json;
}

export async function getJob(jobId: string, apiBase: string): Promise<Job> {
  const res = await fetch(`${apiBase}/api/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(`GET /api/jobs/${jobId} failed: ${res.status}`);
  return JobSchema.parse(await res.json());
}

export function streamUrl(jobId: string, apiBase: string): string {
  return `${apiBase}/api/jobs/${encodeURIComponent(jobId)}/stream`;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/config.ts apps/web/src/lib/api.ts apps/web/tests/lib/api.test.ts
git commit -m "feat(web): typed API client (createJob/getJob/streamUrl)"
```

---

### Task 6.4: `lib/useJobStream.ts` SSE hook (TDD)

**Files:**
- Create: `apps/web/src/lib/useJobStream.ts`
- Create: `apps/web/tests/lib/useJobStream.test.ts`
- Create: `apps/web/vitest.config.ts`

**Purpose:** React hook returning reducer state `{ stage, progress, videoUrl, error, queuedPosition }` driven by SSE events. Disposable on unmount.

- [ ] **Step 1: `vitest.config.ts`** (jsdom env for component + hook tests)

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
```

Create `apps/web/tests/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 2: Test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJobStream } from '../../src/lib/useJobStream';

class MockEventSource {
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  closed = false;
  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }
  addEventListener(type: string, listener: (e: MessageEvent) => void) {
    (this.listeners[type] = this.listeners[type] ?? []).push(listener);
  }
  close() {
    this.closed = true;
  }
  fire(event: string, data: unknown) {
    const evt = new MessageEvent('message', { data: JSON.stringify(data) });
    this.listeners[event]?.forEach((l) => l(evt));
  }
}
let instances: MockEventSource[] = [];

beforeEach(() => {
  instances = [];
  (globalThis as any).EventSource = MockEventSource;
});

afterEach(() => {
  delete (globalThis as any).EventSource;
});

describe('useJobStream', () => {
  it('updates stage + progress on progress events', () => {
    const { result } = renderHook(() => useJobStream('http://api/stream/j1'));
    expect(result.current.stage).toBeNull();
    act(() => instances[0]!.fire('progress', { stage: 'crawl', pct: 40 }));
    expect(result.current.stage).toBe('crawl');
    expect(result.current.progress).toBe(40);
  });

  it('sets videoUrl on done', () => {
    const { result } = renderHook(() => useJobStream('http://api/stream/j1'));
    act(() => instances[0]!.fire('done', { videoUrl: 's3://b/v.mp4' }));
    expect(result.current.videoUrl).toBe('s3://b/v.mp4');
  });

  it('sets error on error event', () => {
    const { result } = renderHook(() => useJobStream('http://api/stream/j1'));
    act(() =>
      instances[0]!.fire('error', { code: 'CRAWL_FAILED', message: 'nope', retryable: false })
    );
    expect(result.current.error?.code).toBe('CRAWL_FAILED');
  });

  it('captures queued position', () => {
    const { result } = renderHook(() => useJobStream('http://api/stream/j1'));
    act(() => instances[0]!.fire('queued', { position: 5, aheadOfYou: 4 }));
    expect(result.current.queuedPosition).toBe(5);
  });

  it('closes EventSource on unmount', () => {
    const { unmount } = renderHook(() => useJobStream('http://api/stream/j1'));
    unmount();
    expect(instances[0]!.closed).toBe(true);
  });

  it('applies initial snapshot when snapshot event received', () => {
    const { result } = renderHook(() => useJobStream('http://api/stream/j1'));
    act(() =>
      instances[0]!.fire('snapshot', {
        jobId: 'j1',
        status: 'crawling',
        stage: 'crawl',
        progress: 10,
        input: { url: 'https://x.com', intent: 'x', duration: 30 },
        fallbacks: [],
        createdAt: 1,
        updatedAt: 1,
      })
    );
    expect(result.current.stage).toBe('crawl');
    expect(result.current.progress).toBe(10);
    expect(result.current.status).toBe('crawling');
  });
});
```

- [ ] **Step 3: Impl**

```ts
import { useEffect, useReducer } from 'react';
import type { JobStatus } from './types';

export interface JobStreamState {
  status: JobStatus | 'connecting';
  stage: 'crawl' | 'storyboard' | 'render' | null;
  progress: number;
  queuedPosition: number | null;
  videoUrl: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

type Action =
  | { type: 'snapshot'; data: { status: JobStatus; stage: JobStreamState['stage']; progress: number } }
  | { type: 'progress'; data: { stage: JobStreamState['stage']; pct: number } }
  | { type: 'queued'; data: { position: number } }
  | { type: 'done'; data: { videoUrl: string } }
  | { type: 'error'; data: { code: string; message: string; retryable: boolean } };

const initial: JobStreamState = {
  status: 'connecting',
  stage: null,
  progress: 0,
  queuedPosition: null,
  videoUrl: null,
  error: null,
};

function reducer(s: JobStreamState, a: Action): JobStreamState {
  switch (a.type) {
    case 'snapshot':
      return { ...s, status: a.data.status, stage: a.data.stage, progress: a.data.progress };
    case 'progress':
      return { ...s, stage: a.data.stage, progress: a.data.pct };
    case 'queued':
      return { ...s, status: 'waiting_render_slot', queuedPosition: a.data.position };
    case 'done':
      return { ...s, status: 'done', progress: 100, videoUrl: a.data.videoUrl };
    case 'error':
      return { ...s, status: 'failed', error: a.data };
  }
}

export function useJobStream(url: string): JobStreamState {
  const [state, dispatch] = useReducer(reducer, initial);
  useEffect(() => {
    const es = new EventSource(url);
    const onSnap = (e: MessageEvent) => dispatch({ type: 'snapshot', data: JSON.parse(e.data) });
    const onProg = (e: MessageEvent) => dispatch({ type: 'progress', data: JSON.parse(e.data) });
    const onQueued = (e: MessageEvent) => dispatch({ type: 'queued', data: JSON.parse(e.data) });
    const onDone = (e: MessageEvent) => dispatch({ type: 'done', data: JSON.parse(e.data) });
    const onErr = (e: MessageEvent) => dispatch({ type: 'error', data: JSON.parse(e.data) });
    es.addEventListener('snapshot', onSnap);
    es.addEventListener('progress', onProg);
    es.addEventListener('queued', onQueued);
    es.addEventListener('done', onDone);
    es.addEventListener('error', onErr);
    return () => es.close();
  }, [url]);
  return state;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/useJobStream.ts apps/web/tests/lib/useJobStream.test.ts apps/web/vitest.config.ts apps/web/tests/setup.ts
git commit -m "feat(web): useJobStream SSE hook with reducer state"
```

---

### Task 6.5: `JobForm` component (TDD)

**Files:**
- Create: `apps/web/src/components/JobForm.tsx`
- Create: `apps/web/tests/components/JobForm.test.tsx`

- [ ] **Step 1: Test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { JobForm } from '../../src/components/JobForm';

const onSubmit = vi.fn().mockResolvedValue({ jobId: 'j1' });

beforeEach(() => {
  onSubmit.mockClear();
});

describe('JobForm', () => {
  it('renders url, intent, duration fields', () => {
    render(<JobForm onSubmit={onSubmit} />);
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/intent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/duration/i)).toBeInTheDocument();
  });

  it('calls onSubmit with parsed values', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/url/i), 'https://example.com');
    await user.type(screen.getByLabelText(/intent/i), 'show features');
    await user.selectOptions(screen.getByLabelText(/duration/i), '30');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).toHaveBeenCalledWith({
      url: 'https://example.com',
      intent: 'show features',
      duration: 30,
    });
  });

  it('shows validation error on bad URL', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/url/i), 'not-a-url');
    await user.type(screen.getByLabelText(/intent/i), 'x');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/valid url/i)).toBeInTheDocument();
  });

  it('disables submit while pending', async () => {
    const user = userEvent.setup();
    let resolve!: (v: { jobId: string }) => void;
    const slow = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    render(<JobForm onSubmit={slow} />);
    await user.type(screen.getByLabelText(/url/i), 'https://x.com');
    await user.type(screen.getByLabelText(/intent/i), 'x');
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(screen.getByRole('button')).toBeDisabled();
    resolve({ jobId: 'j1' });
  });
});
```

- [ ] **Step 2: Impl**

```tsx
'use client';

import { useState } from 'react';
import { JobInputSchema, type JobInput } from '../lib/types';

export interface JobFormProps {
  onSubmit: (input: JobInput) => Promise<{ jobId: string }>;
  initialHint?: string;
  parentJobId?: string;
}

export function JobForm({ onSubmit, initialHint, parentJobId }: JobFormProps) {
  const [url, setUrl] = useState('');
  const [intent, setIntent] = useState(initialHint ?? '');
  const [duration, setDuration] = useState<10 | 30 | 60>(30);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const draft: JobInput = {
      url,
      intent,
      duration,
      ...(parentJobId ? { parentJobId } : {}),
    };
    const parsed = JobInputSchema.safeParse(draft);
    if (!parsed.success) {
      const urlIssue = parsed.error.issues.find((i) => i.path[0] === 'url');
      setError(urlIssue ? 'Please enter a valid URL' : parsed.error.issues[0]?.message ?? 'Invalid input');
      return;
    }
    setPending(true);
    try {
      await onSubmit(parsed.data);
    } catch (err) {
      setError((err as Error).message);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
      <div>
        <label htmlFor="url" className="block text-sm font-medium mb-1">
          URL
        </label>
        <input
          id="url"
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-product.com"
          className="w-full rounded border px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="intent" className="block text-sm font-medium mb-1">
          Intent
        </label>
        <textarea
          id="intent"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="What should the video emphasize?"
          className="w-full rounded border px-3 py-2 h-24"
        />
      </div>
      <div>
        <label htmlFor="duration" className="block text-sm font-medium mb-1">
          Duration
        </label>
        <select
          id="duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value) as 10 | 30 | 60)}
          className="rounded border px-3 py-2"
        >
          <option value={10}>10s</option>
          <option value={30}>30s</option>
          <option value={60}>60s</option>
        </select>
      </div>
      {error ? <div className="text-red-600 text-sm">{error}</div> : null}
      <button
        type="submit"
        disabled={pending}
        className="bg-brand-500 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2 rounded"
      >
        {pending ? 'Creating…' : 'Create video'}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/JobForm.tsx apps/web/tests/components/JobForm.test.tsx
git commit -m "feat(web): JobForm client component with Zod validation"
```

---

### Task 6.6: Presentational components (TDD batched)

**Files (4 components, 1 test file each):**
- Create: `apps/web/src/components/ProgressBar.tsx`
- Create: `apps/web/src/components/StageLabel.tsx`
- Create: `apps/web/src/components/ErrorCard.tsx`
- Create: `apps/web/src/components/VideoResult.tsx`
- Create: `apps/web/tests/components/presentational.test.tsx`

These are pure presentational. Single combined test file.

- [ ] **Step 1: Components**

`ProgressBar.tsx`:
```tsx
export function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden" role="progressbar" aria-valuenow={clamped}>
      <div className="bg-brand-500 h-2 transition-all" style={{ width: `${clamped}%` }} />
    </div>
  );
}
```

`StageLabel.tsx`:
```tsx
type Stage = 'crawl' | 'storyboard' | 'render' | null;

const LABEL: Record<Exclude<Stage, null>, string> = {
  crawl: 'Crawling your site…',
  storyboard: 'Writing the storyboard…',
  render: 'Rendering video…',
};

export function StageLabel({ stage }: { stage: Stage }) {
  if (stage === null) return <span className="text-slate-500">Starting…</span>;
  return <span className="text-slate-800">{LABEL[stage]}</span>;
}
```

`ErrorCard.tsx`:
```tsx
export interface ErrorCardProps {
  code: string;
  message: string;
  retryable: boolean;
  onRetry?: () => void;
}

export function ErrorCard({ code, message, retryable, onRetry }: ErrorCardProps) {
  return (
    <div className="rounded border border-red-300 bg-red-50 p-4 space-y-2">
      <div className="font-medium text-red-800">Something went wrong</div>
      <div className="text-sm text-red-700">
        <span className="font-mono">{code}</span>: {message}
      </div>
      {retryable && onRetry ? (
        <button onClick={onRetry} className="text-sm underline text-red-700">
          Retry
        </button>
      ) : null}
    </div>
  );
}
```

`VideoResult.tsx`:
```tsx
export interface VideoResultProps {
  videoUrl: string;
  resolvedUrl: string; // same URL but resolved to HTTP (via api base or direct S3 http)
}

export function VideoResult({ videoUrl, resolvedUrl }: VideoResultProps) {
  return (
    <div className="space-y-3">
      <video src={resolvedUrl} controls className="w-full rounded" />
      <div className="flex gap-3">
        <a
          href={resolvedUrl}
          download
          className="bg-brand-500 hover:bg-brand-700 text-white px-4 py-2 rounded text-sm"
        >
          Download MP4
        </a>
        <code className="text-xs text-slate-500 self-center break-all">{videoUrl}</code>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Combined test file**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../../src/components/ProgressBar';
import { StageLabel } from '../../src/components/StageLabel';
import { ErrorCard } from '../../src/components/ErrorCard';
import { VideoResult } from '../../src/components/VideoResult';

describe('ProgressBar', () => {
  it('renders clamped percentage', () => {
    render(<ProgressBar pct={150} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
  it('handles negative', () => {
    render(<ProgressBar pct={-10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });
});

describe('StageLabel', () => {
  it('shows Starting… for null stage', () => {
    render(<StageLabel stage={null} />);
    expect(screen.getByText(/starting/i)).toBeInTheDocument();
  });
  it('shows render label', () => {
    render(<StageLabel stage="render" />);
    expect(screen.getByText(/rendering/i)).toBeInTheDocument();
  });
});

describe('ErrorCard', () => {
  it('shows code + message', () => {
    render(<ErrorCard code="X" message="boom" retryable={false} />);
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
  it('shows retry button when retryable + onRetry provided', () => {
    render(<ErrorCard code="X" message="y" retryable={true} onRetry={() => {}} />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('VideoResult', () => {
  it('shows video element + download link with resolved URL', () => {
    const { container } = render(<VideoResult videoUrl="s3://b/v.mp4" resolvedUrl="http://cdn/v.mp4" />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('http://cdn/v.mp4');
    expect(screen.getByRole('link', { name: /download/i })).toHaveAttribute('href', 'http://cdn/v.mp4');
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ProgressBar.tsx apps/web/src/components/StageLabel.tsx apps/web/src/components/ErrorCard.tsx apps/web/src/components/VideoResult.tsx apps/web/tests/components/presentational.test.tsx
git commit -m "feat(web): presentational components (ProgressBar, StageLabel, ErrorCard, VideoResult)"
```

---

### Task 6.7: `JobStatus` composed component (TDD)

**Files:**
- Create: `apps/web/src/components/JobStatus.tsx`
- Create: `apps/web/tests/components/JobStatus.test.tsx`

**Purpose:** Composes `ProgressBar` + `StageLabel` + `VideoResult` + `ErrorCard` based on `useJobStream` state. Takes the stream URL as prop so the consumer can decide whether to construct it from API base + jobId.

- [ ] **Step 1: Impl**

```tsx
'use client';

import { useJobStream } from '../lib/useJobStream';
import { ProgressBar } from './ProgressBar';
import { StageLabel } from './StageLabel';
import { VideoResult } from './VideoResult';
import { ErrorCard } from './ErrorCard';

export interface JobStatusProps {
  streamUrl: string;
  jobId: string;
  resolveVideoUrl: (s3Uri: string) => string;
}

export function JobStatus({ streamUrl, jobId, resolveVideoUrl }: JobStatusProps) {
  const state = useJobStream(streamUrl);

  if (state.status === 'done' && state.videoUrl) {
    return <VideoResult videoUrl={state.videoUrl} resolvedUrl={resolveVideoUrl(state.videoUrl)} />;
  }

  if (state.status === 'failed' && state.error) {
    return <ErrorCard code={state.error.code} message={state.error.message} retryable={state.error.retryable} />;
  }

  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex justify-between items-center">
        <StageLabel stage={state.stage} />
        <span className="text-sm text-slate-500">Job {jobId}</span>
      </div>
      <ProgressBar pct={state.progress} />
      {state.status === 'waiting_render_slot' && state.queuedPosition ? (
        <div className="text-sm text-slate-600">
          Queued — position {state.queuedPosition} (renders are serialized)
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Test — mock `useJobStream`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/lib/useJobStream', () => ({
  useJobStream: vi.fn(),
}));

import { useJobStream } from '../../src/lib/useJobStream';
import { JobStatus } from '../../src/components/JobStatus';

const resolve = (s: string) => s.replace('s3://', 'http://cdn/');

describe('JobStatus', () => {
  it('renders stage + progress during crawling', () => {
    vi.mocked(useJobStream).mockReturnValue({
      status: 'crawling',
      stage: 'crawl',
      progress: 40,
      queuedPosition: null,
      videoUrl: null,
      error: null,
    });
    render(<JobStatus streamUrl="http://api/s" jobId="j1" resolveVideoUrl={resolve} />);
    expect(screen.getByText(/crawling/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });

  it('renders queued message when waiting', () => {
    vi.mocked(useJobStream).mockReturnValue({
      status: 'waiting_render_slot',
      stage: 'render',
      progress: 0,
      queuedPosition: 3,
      videoUrl: null,
      error: null,
    });
    render(<JobStatus streamUrl="http://api/s" jobId="j1" resolveVideoUrl={resolve} />);
    expect(screen.getByText(/position 3/i)).toBeInTheDocument();
  });

  it('renders VideoResult on done', () => {
    vi.mocked(useJobStream).mockReturnValue({
      status: 'done',
      stage: 'render',
      progress: 100,
      queuedPosition: null,
      videoUrl: 's3://b/v.mp4',
      error: null,
    });
    const { container } = render(<JobStatus streamUrl="http://api/s" jobId="j1" resolveVideoUrl={resolve} />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('http://cdn/b/v.mp4');
  });

  it('renders ErrorCard on failed', () => {
    vi.mocked(useJobStream).mockReturnValue({
      status: 'failed',
      stage: 'crawl',
      progress: 0,
      queuedPosition: null,
      videoUrl: null,
      error: { code: 'CRAWL_FAILED', message: 'nope', retryable: false },
    });
    render(<JobStatus streamUrl="http://api/s" jobId="j1" resolveVideoUrl={resolve} />);
    expect(screen.getByText(/CRAWL_FAILED/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/JobStatus.tsx apps/web/tests/components/JobStatus.test.tsx
git commit -m "feat(web): JobStatus composes ProgressBar/VideoResult/ErrorCard via useJobStream"
```

---

### Task 6.8: `RegenerateButton` + regenerate flow

**Files:**
- Create: `apps/web/src/components/RegenerateButton.tsx`
- Create: `apps/web/tests/components/RegenerateButton.test.tsx`

**Purpose:** Inline panel shown under the video result. User types a hint, clicks "Regenerate" → POST /api/jobs with parentJobId + hint → navigate to new job page.

- [ ] **Step 1: Impl**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JobInput } from '../lib/types';

export interface RegenerateButtonProps {
  parentJobId: string;
  parentInput: Pick<JobInput, 'url' | 'duration'>;
  onSubmit: (input: JobInput) => Promise<{ jobId: string }>;
}

export function RegenerateButton({ parentJobId, parentInput, onSubmit }: RegenerateButtonProps) {
  const router = useRouter();
  const [hint, setHint] = useState('');
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!hint) return;
    setPending(true);
    try {
      const { jobId } = await onSubmit({
        url: parentInput.url,
        intent: hint,
        duration: parentInput.duration,
        parentJobId,
        hint,
      });
      router.push(`/jobs/${jobId}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded border bg-slate-50 p-4 space-y-3">
      <div className="font-medium text-slate-800">Not quite right?</div>
      <textarea
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="Tell us what to change (e.g. faster pace, emphasize the data security)"
        className="w-full rounded border px-3 py-2 h-20"
      />
      <button
        onClick={handleClick}
        disabled={!hint || pending}
        className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white px-4 py-2 rounded text-sm"
      >
        {pending ? 'Regenerating…' : 'Regenerate with hint'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Test**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

import { RegenerateButton } from '../../src/components/RegenerateButton';

const onSubmit = vi.fn();

beforeEach(() => {
  pushMock.mockClear();
  onSubmit.mockClear();
});

describe('RegenerateButton', () => {
  it('stays disabled until hint has content', () => {
    render(
      <RegenerateButton
        parentJobId="p1"
        parentInput={{ url: 'https://x.com', duration: 30 }}
        onSubmit={onSubmit}
      />
    );
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeDisabled();
  });

  it('submits with parentJobId + hint, then navigates', async () => {
    const user = userEvent.setup();
    onSubmit.mockResolvedValue({ jobId: 'j2' });
    render(
      <RegenerateButton
        parentJobId="p1"
        parentInput={{ url: 'https://x.com', duration: 30 }}
        onSubmit={onSubmit}
      />
    );
    await user.type(screen.getByRole('textbox'), 'faster pace');
    await user.click(screen.getByRole('button', { name: /regenerate/i }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ parentJobId: 'p1', hint: 'faster pace', url: 'https://x.com', duration: 30 })
    );
    expect(pushMock).toHaveBeenCalledWith('/jobs/j2');
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/RegenerateButton.tsx apps/web/tests/components/RegenerateButton.test.tsx
git commit -m "feat(web): RegenerateButton with parentJobId + hint submission"
```

---

### Task 6.9: Pages + wire the app together

**Files:**
- Replace: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/jobs/[jobId]/page.tsx`
- Update: `apps/web/src/app/layout.tsx` (nicer shell, nav with logo)
- Update: `apps/web/src/app/globals.css` (minor tweaks)

Home page wraps `JobForm` and handles the API call + redirect. Job page reads the initial Job snapshot via `getJob` (server-side? client-side first paint, simpler) and renders `JobStatus` + `RegenerateButton`.

**Design note:** since `/jobs/[jobId]` needs SSE + interactive pieces, and SSR would block the initial paint on a snapshot fetch, implement it as a pure client-side component that mounts `JobStatus` immediately. The SSE first event will be the snapshot.

- [ ] **Step 1: Home page**

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { JobForm } from '../components/JobForm';
import { createJob } from '../lib/api';
import { API_BASE } from '../lib/config';

export default function Home() {
  const router = useRouter();
  return (
    <main className="max-w-2xl mx-auto p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Turn any URL into a demo video</h1>
        <p className="text-slate-600 mt-2">
          Paste a product URL, describe what to emphasize, and get a 10/30/60-second demo rendered with Remotion.
        </p>
      </header>
      <JobForm
        onSubmit={async (input) => {
          const res = await createJob(input, API_BASE);
          router.push(`/jobs/${res.jobId}`);
          return res;
        }}
      />
    </main>
  );
}
```

- [ ] **Step 2: Job page**

```tsx
'use client';

import { use } from 'react';
import { JobStatus } from '../../../components/JobStatus';
import { RegenerateButton } from '../../../components/RegenerateButton';
import { createJob, streamUrl } from '../../../lib/api';
import { API_BASE } from '../../../lib/config';
import { useEffect, useState } from 'react';

interface PageProps {
  params: Promise<{ jobId: string }>;
}

// Resolve `s3://bucket/key` by mapping to API base's `/s3/<bucket>/<key>` proxy,
// or simply route to MinIO path-style URL if the bucket is public-read.
// Dev/MVP: assume MinIO public path-style (crawler sets `mc anonymous set download`).
function resolveVideoUrl(s3Uri: string): string {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(s3Uri);
  if (!m) return s3Uri;
  const endpoint = process.env.NEXT_PUBLIC_S3_ENDPOINT ?? 'http://localhost:9000';
  return `${endpoint}/${m[1]}/${m[2]}`;
}

export default function JobPage({ params }: PageProps) {
  const { jobId } = use(params);
  const [parentInput, setParentInput] = useState<{ url: string; duration: 10 | 30 | 60 } | null>(null);

  // Fetch the initial job to grab input.url + input.duration for the regenerate flow.
  useEffect(() => {
    fetch(`${API_BASE}/api/jobs/${encodeURIComponent(jobId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((job) => {
        if (job?.input) setParentInput({ url: job.input.url, duration: job.input.duration });
      })
      .catch(() => {});
  }, [jobId]);

  return (
    <main className="max-w-3xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Your video</h1>
      <JobStatus streamUrl={streamUrl(jobId, API_BASE)} jobId={jobId} resolveVideoUrl={resolveVideoUrl} />
      {parentInput ? (
        <RegenerateButton
          parentJobId={jobId}
          parentInput={parentInput}
          onSubmit={(input) => createJob(input, API_BASE)}
        />
      ) : null}
    </main>
  );
}
```

- [ ] **Step 3: Update layout**

```tsx
import './globals.css';

export const metadata = {
  title: 'PromptDemo',
  description: 'Turn any URL into a demo video',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <nav className="border-b">
          <div className="max-w-5xl mx-auto p-4 flex items-center gap-4">
            <a href="/" className="font-semibold text-lg">
              PromptDemo
            </a>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm --filter @promptdemo/web typecheck
pnpm --filter @promptdemo/web test
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/
git commit -m "feat(web): home + /jobs/[jobId] pages wired with JobForm + JobStatus + Regenerate"
```

---

### Task 6.10: Dockerfile (Next.js standalone)

**Files:**
- Create: `apps/web/Dockerfile`

Use Next.js's `output: 'standalone'` mode to get a small runnable build.

- [ ] **Step 1: `Dockerfile`**

```dockerfile
# Build stage
FROM node:20.11.1-bookworm-slim AS builder
WORKDIR /repo

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile

COPY apps/web/ apps/web/

WORKDIR /repo/apps/web
RUN pnpm build

# Runtime stage
FROM node:20.11.1-bookworm-slim AS runner

RUN apt-get update && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /repo/apps/web/.next/standalone/ ./
COPY --from=builder /repo/apps/web/.next/static/ ./apps/web/.next/static/
COPY --from=builder /repo/apps/web/public/ ./apps/web/public/

EXPOSE 3001
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
```

Note: standalone output emits a `server.js` inside the app's path. If path is different (future Next.js version), adjust CMD. The `public/` COPY can fail if `apps/web/public/` doesn't exist — create an empty `public/.gitkeep`.

- [ ] **Step 2: Create `apps/web/public/.gitkeep`**

```bash
touch apps/web/public/.gitkeep
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/Dockerfile apps/web/public/.gitkeep
git commit -m "feat(web): Next.js standalone Dockerfile"
```

---

### Task 6.11: Final validate + tag `v0.6.0-web`

- [ ] **Step 1: Full workspace validation**

```bash
pnpm -r typecheck
pnpm -r test
```

Expected new tests:
- types: 7 (4 JobInput + 3 Job)
- api: 5 (createJob 2 + getJob 2 + streamUrl 1)
- useJobStream: 6
- JobForm: 4
- presentational: 8 (ProgressBar 2 + StageLabel 2 + ErrorCard 2 + VideoResult 1 (or 2))
- JobStatus: 4
- RegenerateButton: 2

~36 new tests.

Grand total (all 7 packages): **~226 passing + 2 skipped**.

- [ ] **Step 2: Tag (NO push — controller decides)**

```bash
git tag -a v0.6.0-web -m "Phase 6: Next.js frontend complete

Adds @promptdemo/web:
- Next.js 14 App Router + React 18 + TypeScript + Tailwind 3.4
- Home page with JobForm (client-side Zod validation)
- /jobs/[jobId] progress page with SSE-driven status, queue position,
  video playback, download, and regenerate flow
- Components: JobForm, JobStatus, ProgressBar, StageLabel, VideoResult,
  ErrorCard, RegenerateButton
- lib: typed api client (createJob/getJob/streamUrl), useJobStream hook
  with reducer state over SSE events (progress/queued/done/error/snapshot),
  Zod schemas mirroring the API Job contract
- Standalone Next.js Dockerfile (two-stage, slim runtime)

Talks to @promptdemo/api over REST+SSE via NEXT_PUBLIC_API_BASE.
Resolves s3:// video URLs via NEXT_PUBLIC_S3_ENDPOINT (dev: MinIO public-read).

~36 tests passing."
```

Controller may push after review.

---

## Self-Review

**Spec coverage (§3):**
- POST /jobs ✓ (6.3 + 6.5)
- GET /jobs/:id polled once for parent input, then live via SSE ✓ (6.9)
- SSE stream consumer with all event types (progress/queued/done/error/snapshot) ✓ (6.4)
- Regenerate with hint ✓ (6.8)
- Error surfacing with code + message + retryable ✓ (6.6 ErrorCard)

**Placeholders:** None. `resolveVideoUrl` dev default to MinIO is documented in-line; prod swap is a Plan 7 concern.

**Type consistency:**
- Local `JobInputSchema` / `JobSchema` stay in sync with `apps/api/src/model/job.ts` by convention. No cross-import (avoids pulling Node-only deps into the browser). A light integration test in Plan 4's `app.test.ts` already exercises the full contract end-to-end.
- `JobStreamState.status` uses the same status enum as API's `JobStatus`; keep both Zod definitions byte-identical.

**Scope check:** 11 tasks, one package, no changes to other packages (apart from workspace glob pickup). Independently shippable (talks only to the HTTP API).

---

## Execution Handoff

Subagent-driven compressed or inline. Controller picks.
