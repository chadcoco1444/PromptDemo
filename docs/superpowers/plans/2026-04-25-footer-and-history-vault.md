# Professional Footer + User History Vault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder footer with a 4-column professional footer + 10 Coming Soon stub pages; add Download MP4/JSON, Fork & Edit, and Free-tier watermark upgrade prompt to every History card.

**Architecture:** Footer is a pure UI change (no API). History Vault adds one new Next.js API route (`/api/jobs/[jobId]/download`), extends the jobs list API response with a `tier` field, restructures `HistoryCard` from a monolithic `<Link>` to a card with a separate action row, and adds fork-prefill support to the Create page.

**Tech Stack:** Next.js 14 App Router (RSC + Route Handlers), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`, pg Pool, Vitest, React Testing Library, Tailwind CSS, TypeScript

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `apps/web/src/components/ComingSoonPage.tsx` | **create** | Shared RSC template for all stub pages |
| `apps/web/src/app/about/page.tsx` | **create** | Stub page → ComingSoonPage |
| `apps/web/src/app/blog/page.tsx` | **create** | Stub page |
| `apps/web/src/app/careers/page.tsx` | **create** | Stub page |
| `apps/web/src/app/features/page.tsx` | **create** | Stub page |
| `apps/web/src/app/api-docs/page.tsx` | **create** | Stub page |
| `apps/web/src/app/docs/page.tsx` | **create** | Stub page |
| `apps/web/src/app/help/page.tsx` | **create** | Stub page |
| `apps/web/src/app/privacy/page.tsx` | **create** | Stub page |
| `apps/web/src/app/terms/page.tsx` | **create** | Stub page |
| `apps/web/src/app/security/page.tsx` | **create** | Stub page |
| `apps/web/src/components/landing/LandingFooter.tsx` | modify | 4-column layout + social icons |
| `apps/web/src/app/api/jobs/[jobId]/download/route.ts` | **create** | Presigned URL download endpoint |
| `apps/web/src/app/api/users/me/jobs/route.ts` | modify | Add `tier` field to response |
| `apps/web/src/components/history/HistoryCard.tsx` | modify | Action row + watermark hint + structural refactor |
| `apps/web/src/components/HistoryGrid.tsx` | modify | Read `tier` from API, pass to cards |
| `apps/web/src/app/create/page.tsx` | modify | Handle `forkId` searchParam |
| `apps/web/src/components/CreatePageBody.tsx` | modify | Accept `fork` prop, no auto-submit for fork |

---

## Task 1: `ComingSoonPage` Component + Stub Routes

**Files:**
- Create: `apps/web/src/components/ComingSoonPage.tsx`
- Create: `apps/web/src/app/about/page.tsx`
- Create: `apps/web/src/app/blog/page.tsx`
- Create: `apps/web/src/app/careers/page.tsx`
- Create: `apps/web/src/app/features/page.tsx`
- Create: `apps/web/src/app/api-docs/page.tsx`
- Create: `apps/web/src/app/docs/page.tsx`
- Create: `apps/web/src/app/help/page.tsx`
- Create: `apps/web/src/app/privacy/page.tsx`
- Create: `apps/web/src/app/terms/page.tsx`
- Create: `apps/web/src/app/security/page.tsx`

- [ ] **Step 1.1: Create `ComingSoonPage.tsx`**

Create `apps/web/src/components/ComingSoonPage.tsx`:

```tsx
import Link from 'next/link';

export function ComingSoonPage({ name }: { name: string }) {
  return (
    <main
      className="min-h-[calc(100vh-65px)] flex items-center justify-center px-6"
      style={{ background: '#0a0a0a' }}
    >
      <div className="text-center space-y-6 max-w-md">
        <span className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full ring-1 ring-violet-500/40 bg-violet-500/10 text-violet-300">
          Coming Soon
        </span>
        <h1
          className="font-extrabold tracking-tight text-transparent bg-clip-text leading-tight"
          style={{
            backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
            fontSize: 'clamp(28px, 5vw, 48px)',
            letterSpacing: '-0.02em',
          }}
        >
          {name}
        </h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          We're working on this page. Check back soon.
        </p>
        <Link
          href="/"
          className="inline-block text-sm text-brand-400 hover:text-brand-300 transition-colors"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 1.2: Create all 10 stub pages**

Create `apps/web/src/app/about/page.tsx`:
```tsx
import { ComingSoonPage } from '../../components/ComingSoonPage';
export default function AboutPage() { return <ComingSoonPage name="About" />; }
```

Create `apps/web/src/app/blog/page.tsx`:
```tsx
import { ComingSoonPage } from '../../components/ComingSoonPage';
export default function BlogPage() { return <ComingSoonPage name="Blog" />; }
```

Create `apps/web/src/app/careers/page.tsx`:
```tsx
import { ComingSoonPage } from '../../components/ComingSoonPage';
export default function CareersPage() { return <ComingSoonPage name="Careers" />; }
```

Create `apps/web/src/app/features/page.tsx`:
```tsx
import { ComingSoonPage } from '../../components/ComingSoonPage';
export default function FeaturesPage() { return <ComingSoonPage name="Features" />; }
```

Create `apps/web/src/app/api-docs/page.tsx`:
```tsx
import { ComingSoonPage } from '../../components/ComingSoonPage';
export default function ApiDocsPage() { return <ComingSoonPage name="API Docs" />; }
```

Create `apps/web/src/app/docs/page.tsx`:
```tsx
import { ComingSoonPage } from '../../components/ComingSoonPage';
export default function DocsPage() { return <ComingSoonPage name="Documentation" />; }
```

Create `apps/web/src/app/help/page.tsx`:
```tsx
import { ComingSoonPage } from '../../components/ComingSoonPage';
export default function HelpPage() { return <ComingSoonPage name="Help Center" />; }
```

Create `apps/web/src/app/privacy/page.tsx`:
```tsx
import { ComingSoonPage } from '../../components/ComingSoonPage';
export default function PrivacyPage() { return <ComingSoonPage name="Privacy Policy" />; }
```

Create `apps/web/src/app/terms/page.tsx`:
```tsx
import { ComingSoonPage } from '../../components/ComingSoonPage';
export default function TermsPage() { return <ComingSoonPage name="Terms of Service" />; }
```

Create `apps/web/src/app/security/page.tsx`:
```tsx
import { ComingSoonPage } from '../../components/ComingSoonPage';
export default function SecurityPage() { return <ComingSoonPage name="Security" />; }
```

- [ ] **Step 1.3: Run tests**

```bash
cd apps/web && pnpm test
```

Expected: all existing tests pass (these files add no logic, just RSC renders).

- [ ] **Step 1.4: Commit**

```bash
git add apps/web/src/components/ComingSoonPage.tsx \
        apps/web/src/app/about/page.tsx \
        apps/web/src/app/blog/page.tsx \
        apps/web/src/app/careers/page.tsx \
        apps/web/src/app/features/page.tsx \
        apps/web/src/app/api-docs/page.tsx \
        apps/web/src/app/docs/page.tsx \
        apps/web/src/app/help/page.tsx \
        apps/web/src/app/privacy/page.tsx \
        apps/web/src/app/terms/page.tsx \
        apps/web/src/app/security/page.tsx
git commit -m "feat(web): add ComingSoonPage template + 10 stub routes"
```

---

## Task 2: Professional Footer — 4 Columns + Social Icons

**Files:**
- Modify: `apps/web/src/components/landing/LandingFooter.tsx`

- [ ] **Step 2.1: Write the failing test**

Open `apps/web/src/tests/LandingFooter.test.tsx` (create if it doesn't exist):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LandingFooter } from '../../components/landing/LandingFooter';

describe('LandingFooter', () => {
  it('renders all four column headings', () => {
    render(<LandingFooter />);
    expect(screen.getByText('Company')).toBeTruthy();
    expect(screen.getByText('Product')).toBeTruthy();
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Legal')).toBeTruthy();
  });

  it('renders copyright text', () => {
    render(<LandingFooter />);
    expect(screen.getByText(/2026 PromptDemo Inc/)).toBeTruthy();
  });

  it('renders GitHub social link', () => {
    render(<LandingFooter />);
    const links = screen.getAllByRole('link');
    const github = links.find(l => (l as HTMLAnchorElement).href.includes('github.com'));
    expect(github).toBeTruthy();
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- --reporter=verbose 2>&1 | grep -A5 "LandingFooter"
```

Expected: 3 failures — "Company" not found, "2026 PromptDemo Inc" not found, GitHub link count wrong.

- [ ] **Step 2.3: Rewrite `LandingFooter.tsx`**

Replace the entire content of `apps/web/src/components/landing/LandingFooter.tsx`:

```tsx
import Link from 'next/link';

const COMPANY = [
  { label: 'About', href: '/about' },
  { label: 'Blog', href: '/blog' },
  { label: 'Careers', href: '/careers' },
];

const PRODUCT = [
  { label: 'Features', href: '/features' },
  { label: 'API Docs', href: '/api-docs' },
  { label: 'Pricing', href: '/billing' },
  { label: 'History', href: '/history' },
];

const SUPPORT = [
  { label: 'Documentation', href: '/docs' },
  { label: 'Help Center', href: '/help' },
  { label: 'Contact', href: 'mailto:hi@promptdemo.dev' },
];

const LEGAL = [
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
  { label: 'Security', href: '/security' },
];

function LinkCluster({ heading, links }: { heading: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{heading}</h4>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-sm text-gray-400 hover:text-brand-300 transition-colors"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TwitterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.056a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-[#0a0a0a] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
          <LinkCluster heading="Company" links={COMPANY} />
          <LinkCluster heading="Product" links={PRODUCT} />
          <LinkCluster heading="Support" links={SUPPORT} />
          <LinkCluster heading="Legal" links={LEGAL} />
        </div>
        <div className="mt-16 pt-6 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-bold text-white text-sm">PromptDemo</span>
            <span className="text-xs text-gray-500">© 2026 PromptDemo Inc.</span>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="https://twitter.com/promptdemo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Twitter"
            >
              <TwitterIcon />
            </a>
            <a
              href="https://github.com/chadcoco1444/PromptDemo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="GitHub"
            >
              <GitHubIcon />
            </a>
            <a
              href="https://discord.gg/promptdemo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Discord"
            >
              <DiscordIcon />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2.4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- --reporter=verbose 2>&1 | grep -A5 "LandingFooter"
```

Expected: 3 tests pass — Company/Product/Support/Legal all found, copyright found, GitHub link found.

- [ ] **Step 2.5: Commit**

```bash
git add apps/web/src/components/landing/LandingFooter.tsx apps/web/src/tests/LandingFooter.test.tsx
git commit -m "feat(web): professional footer — 4-column layout + social icons"
```

---

## Task 3: Install `@aws-sdk/s3-request-presigner` + Download API Route

**Files:**
- Modify: `apps/web/package.json` (dependency add)
- Create: `apps/web/src/app/api/jobs/[jobId]/download/route.ts`

- [ ] **Step 3.1: Add the presigner package**

```bash
cd apps/web && pnpm add @aws-sdk/s3-request-presigner
```

Expected: package added to `apps/web/package.json` dependencies.

- [ ] **Step 3.2: Write the failing test**

Create `apps/web/src/tests/api/download.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pg pool
const mockQuery = vi.fn();
vi.mock('../../../lib/pg', () => ({ getPool: () => ({ query: mockQuery }) }));

// Mock S3 client
vi.mock('../../../lib/s3', () => ({
  getS3Client: () => ({}),
  getS3Bucket: () => 'test-bucket',
}));

// Mock presigner
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

// Mock auth
vi.mock('../../../auth', () => ({
  isAuthEnabled: () => true,
  auth: vi.fn().mockResolvedValue({ user: { id: '42' } }),
}));

import { GET } from '../../../app/api/jobs/[jobId]/download/route';

describe('GET /api/jobs/[jobId]/download', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 for invalid type param', async () => {
    const req = new Request('http://localhost/api/jobs/abc/download?type=invalid');
    const res = await GET(req, { params: { jobId: 'abc' } });
    expect(res.status).toBe(400);
  });

  it('returns 404 when job not found or not owned', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    const req = new Request('http://localhost/api/jobs/abc/download?type=mp4');
    const res = await GET(req, { params: { jobId: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 404 when video_url is null', async () => {
    mockQuery.mockResolvedValue({ rows: [{ video_url: null, storyboard_uri: null }] });
    const req = new Request('http://localhost/api/jobs/abc/download?type=mp4');
    const res = await GET(req, { params: { jobId: 'abc' } });
    expect(res.status).toBe(404);
  });

  it('returns 307 redirect to presigned URL for valid mp4 request', async () => {
    mockQuery.mockResolvedValue({ rows: [{ video_url: 's3://test-bucket/jobs/abc/video.mp4', storyboard_uri: 's3://test-bucket/jobs/abc/storyboard.json' }] });
    const req = new Request('http://localhost/api/jobs/abc/download?type=mp4');
    const res = await GET(req, { params: { jobId: 'abc' } });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('presigned-url');
  });

  it('returns 307 redirect to presigned URL for valid storyboard request', async () => {
    mockQuery.mockResolvedValue({ rows: [{ video_url: 's3://test-bucket/jobs/abc/video.mp4', storyboard_uri: 's3://test-bucket/jobs/abc/storyboard.json' }] });
    const req = new Request('http://localhost/api/jobs/abc/download?type=storyboard');
    const res = await GET(req, { params: { jobId: 'abc' } });
    expect(res.status).toBe(307);
  });
});
```

- [ ] **Step 3.3: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- src/tests/api/download.test.ts
```

Expected: `Cannot find module '../../../app/api/jobs/[jobId]/download/route'`.

- [ ] **Step 3.4: Create the download route**

Create `apps/web/src/app/api/jobs/[jobId]/download/route.ts`:

```typescript
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { auth, isAuthEnabled } from '../../../../../auth';
import { getPool } from '../../../../../lib/pg';
import { getS3Client, getS3Bucket } from '../../../../../lib/s3';

export const dynamic = 'force-dynamic';

const PRESIGN_EXPIRES = 900; // 15 minutes

function parseS3Uri(uri: string): { bucket: string; key: string } | null {
  const m = /^s3:\/\/([^/]+)\/(.+)$/.exec(uri);
  if (!m) return null;
  return { bucket: m[1]!, key: m[2]! };
}

export async function GET(request: Request, ctx: { params: { jobId: string } }) {
  if (!isAuthEnabled() || !auth) {
    return new Response('not_found', { status: 404 });
  }
  const session = await auth();
  if (!session?.user) {
    return new Response('unauthorized', { status: 401 });
  }
  const userId = (session.user as { id?: string }).id;
  if (!userId) return new Response('not_found', { status: 404 });

  const { jobId } = ctx.params;
  if (!jobId || jobId.length > 64 || !/^[A-Za-z0-9_-]+$/.test(jobId)) {
    return new Response('not_found', { status: 404 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  if (type !== 'mp4' && type !== 'storyboard') {
    return new Response(JSON.stringify({ error: 'type must be mp4 or storyboard' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT video_url, storyboard_uri
     FROM jobs
     WHERE id = $1 AND user_id = $2
     LIMIT 1`,
    [jobId, Number(userId)],
  );

  if (rows.length === 0) {
    return new Response('not_found', { status: 404 });
  }

  const row = rows[0] as { video_url: string | null; storyboard_uri: string | null };
  const rawUri = type === 'mp4' ? row.video_url : row.storyboard_uri;

  if (!rawUri) {
    return new Response('not_found', { status: 404 });
  }

  const parsed = parseS3Uri(rawUri);
  if (!parsed) {
    return new Response('not_found', { status: 404 });
  }

  const filename =
    type === 'mp4'
      ? `promptdemo-${jobId}.mp4`
      : `storyboard-${jobId}.json`;

  const s3 = getS3Client();
  const cmd = new GetObjectCommand({
    Bucket: parsed.bucket,
    Key: parsed.key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
  });

  const presignedUrl = await getSignedUrl(s3, cmd, { expiresIn: PRESIGN_EXPIRES });
  return Response.redirect(presignedUrl, 307);
}
```

- [ ] **Step 3.5: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- src/tests/api/download.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 3.6: Commit**

```bash
git add apps/web/package.json apps/web/src/app/api/jobs/[jobId]/download/route.ts apps/web/src/tests/api/download.test.ts
git commit -m "feat(web): add /api/jobs/[jobId]/download presigned URL endpoint"
```

---

## Task 4: Add `tier` to Jobs API Response

**Files:**
- Modify: `apps/web/src/app/api/users/me/jobs/route.ts`

- [ ] **Step 4.1: Write the failing test**

Open `apps/web/src/tests/api/userJobs.test.ts` (create if needed):

```typescript
import { describe, it, expect, vi } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../../../lib/pg', () => ({ getPool: () => ({ query: mockQuery }) }));
vi.mock('../../../../auth', () => ({
  isAuthEnabled: () => true,
  auth: vi.fn().mockResolvedValue({ user: { id: '42' } }),
}));

import { GET } from '../../../../app/api/users/me/jobs/route';

describe('GET /api/users/me/jobs', () => {
  it('includes tier in response', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ tier: 'pro' }] }) // getUserTier query
      .mockResolvedValueOnce({ rows: [] }); // jobs query
    const req = new Request('http://localhost/api/users/me/jobs');
    const res = await GET(req);
    const body = await res.json() as { tier?: string };
    expect(body.tier).toBe('pro');
  });

  it('defaults tier to free when no subscription row', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] }) // getUserTier returns empty
      .mockResolvedValueOnce({ rows: [] }); // jobs query
    const req = new Request('http://localhost/api/users/me/jobs');
    const res = await GET(req);
    const body = await res.json() as { tier?: string };
    expect(body.tier).toBe('free');
  });
});
```

- [ ] **Step 4.2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- src/tests/api/userJobs.test.ts
```

Expected: FAIL — `body.tier` is `undefined`.

- [ ] **Step 4.3: Add tier query to the route**

In `apps/web/src/app/api/users/me/jobs/route.ts`, add a tier lookup after the `userId` check and before the main jobs query. Find the line `const url = new URL(request.url);` and add before it:

```typescript
  // Resolve the user's tier for PLG watermark hint on the client.
  let tier: 'free' | 'pro' | 'max' = 'free';
  try {
    const tierResult = await pool.query<{ tier: string }>(
      `SELECT COALESCE(s.tier, 'free') AS tier
       FROM users u
       LEFT JOIN subscriptions s ON s.user_id = u.id
       WHERE u.id = $1`,
      [Number(userId)],
    );
    const raw = tierResult.rows[0]?.tier ?? 'free';
    tier = raw === 'pro' || raw === 'max' ? raw : 'free';
  } catch {
    // Non-fatal: fall back to free
  }
```

Then in the `return NextResponse.json({...})` at the bottom, add `tier` to the response object:

```typescript
    return NextResponse.json({
      jobs: visible.map((r) => { /* existing map */ }),
      hasMore,
      tier,
    });
```

Also update the error return at the bottom to include tier:
```typescript
    return NextResponse.json({ jobs: [], warning: 'query_failed', tier: 'free' });
```

Note: the `pool` variable must be moved above the tier query. Currently `const pool = getPool();` is inside the try block. Move it before the tier query:

The updated structure inside `try`:
```typescript
  try {
    const pool = getPool();

    // Tier lookup (non-fatal)
    let tier: 'free' | 'pro' | 'max' = 'free';
    try {
      const tierResult = await pool.query<{ tier: string }>(
        `SELECT COALESCE(s.tier, 'free') AS tier
         FROM users u
         LEFT JOIN subscriptions s ON s.user_id = u.id
         WHERE u.id = $1`,
        [Number(userId)],
      );
      const raw = tierResult.rows[0]?.tier ?? 'free';
      tier = raw === 'pro' || raw === 'max' ? raw : 'free';
    } catch {
      // non-fatal
    }

    const url = new URL(request.url);
    // ... rest of existing query params / WHERE / SQL / rows ...

    return NextResponse.json({
      jobs: visible.map((r) => { /* ... */ }),
      hasMore,
      tier,
    });
  } catch (err) {
    // ...
    return NextResponse.json({ jobs: [], warning: 'query_failed', tier: 'free' });
  }
```

- [ ] **Step 4.4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- src/tests/api/userJobs.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 4.5: Run full web test suite**

```bash
cd apps/web && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4.6: Commit**

```bash
git add apps/web/src/app/api/users/me/jobs/route.ts apps/web/src/tests/api/userJobs.test.ts
git commit -m "feat(web): add tier field to /api/users/me/jobs response"
```

---

## Task 5: Restructure `HistoryCard` — Action Row + Watermark Hint

**Files:**
- Modify: `apps/web/src/components/history/HistoryCard.tsx`

- [ ] **Step 5.1: Write the failing test**

Open `apps/web/src/tests/HistoryCard.test.tsx` (create if needed):

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HistoryCard, type HistoryJob } from '../../components/history/HistoryCard';

const doneJob: HistoryJob = {
  jobId: 'job1',
  parentJobId: null,
  status: 'done',
  stage: 'render',
  input: { url: 'https://example.com', intent: 'Demo', duration: 30 },
  videoUrl: 's3://bucket/jobs/job1/video.mp4',
  thumbUrl: null,
  coverUrl: null,
  createdAt: Date.now() - 60_000,
  parent: null,
};

describe('HistoryCard action row', () => {
  it('shows download and fork buttons for done jobs', () => {
    render(<HistoryCard job={doneJob} tier="pro" />);
    expect(screen.getByText(/mp4/i)).toBeTruthy();
    expect(screen.getByText(/json/i)).toBeTruthy();
    expect(screen.getByText(/fork/i)).toBeTruthy();
  });

  it('hides action row for generating jobs', () => {
    const generatingJob = { ...doneJob, status: 'generating', videoUrl: null };
    render(<HistoryCard job={generatingJob} tier="pro" />);
    expect(screen.queryByText(/mp4/i)).toBeNull();
  });

  it('shows watermark upgrade hint for free tier done jobs', () => {
    render(<HistoryCard job={doneJob} tier="free" />);
    expect(screen.getByText(/upgrade/i)).toBeTruthy();
  });

  it('hides watermark hint for pro tier', () => {
    render(<HistoryCard job={doneJob} tier="pro" />);
    expect(screen.queryByText(/upgrade/i)).toBeNull();
  });
});
```

- [ ] **Step 5.2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- src/tests/HistoryCard.test.tsx
```

Expected: TypeScript error — `tier` prop not on `HistoryCard`, download/fork buttons missing.

- [ ] **Step 5.3: Rewrite `HistoryCard.tsx`**

Replace the full content of `apps/web/src/components/history/HistoryCard.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { hostnameOf } from '../../lib/url-utils';
import { LineageBadge, type ParentInfo } from './LineageBadge';
import type { Tier } from '../../lib/tier';

export interface HistoryJob {
  jobId: string;
  parentJobId: string | null;
  status: string;
  stage: string | null;
  input: { url: string; intent: string; duration: 10 | 30 | 60 };
  videoUrl: string | null;
  thumbUrl: string | null;
  coverUrl: string | null;
  createdAt: number;
  parent: ParentInfo | null;
}

type DisplayStatus = 'generating' | 'done' | 'failed';

function bucketStatus(raw: string): DisplayStatus {
  if (raw === 'done') return 'done';
  if (raw === 'failed') return 'failed';
  return 'generating';
}

const STATUS_LABEL: Record<DisplayStatus, string> = {
  generating: 'Generating',
  done: 'Done',
  failed: 'Failed',
};

const STATUS_BADGE_CLASS: Record<DisplayStatus, string> = {
  generating: 'bg-amber-50/10 text-amber-300 ring-1 ring-amber-500/30',
  done: 'bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/30',
  failed: 'bg-red-500/10 text-red-300 ring-1 ring-red-500/30',
};

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function HistoryCard({ job, tier }: { job: HistoryJob; tier: Tier }) {
  const display = bucketStatus(job.status);
  const isDone = display === 'done';

  return (
    <div
      className={
        'group rounded-2xl ring-1 ring-white/10 bg-white/5 backdrop-blur-md overflow-hidden ' +
        'transition-all duration-200 ease-out hover:-translate-y-1 hover:ring-violet-500/40 ' +
        'hover:shadow-2xl hover:shadow-violet-500/20 motion-reduce:hover:translate-y-0 motion-reduce:transition-none'
      }
    >
      {/* Clickable area — navigates to job detail */}
      <Link
        href={`/jobs/${job.jobId}`}
        className="block p-4 space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a14]"
      >
        {/* Thumbnail */}
        <div className="relative aspect-video rounded-lg bg-gray-800/50 overflow-hidden flex items-center justify-center ring-1 ring-white/5">
          {job.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={job.coverUrl}
              alt=""
              className={
                'w-full h-full object-cover transition-opacity ' +
                (display === 'generating' ? 'opacity-70' : '')
              }
            />
          ) : (
            <span className="text-xs font-mono uppercase text-gray-500">{STATUS_LABEL[display]}</span>
          )}
          {display === 'generating' && job.coverUrl ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <span className="text-[11px] uppercase tracking-wider text-white px-2 py-1 rounded bg-black/50 backdrop-blur-sm animate-pulse">
                Generating
              </span>
            </div>
          ) : null}
        </div>

        {/* Meta */}
        <div className="space-y-1">
          <div className="text-sm font-medium text-gray-100 truncate">
            {hostnameOf(job.input.url)}
          </div>
          <div className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
            {job.input.intent}
          </div>
          {job.parent ? (
            <div className="pt-1">
              <LineageBadge parent={job.parent} currentUrl={job.input.url} />
            </div>
          ) : null}
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between text-[11px] text-gray-500">
          <span>
            {job.input.duration}s · {relativeTime(job.createdAt)}
          </span>
          <span className={`px-1.5 py-0.5 rounded font-medium ${STATUS_BADGE_CLASS[display]}`}>
            {STATUS_LABEL[display]}
          </span>
        </div>
      </Link>

      {/* Action row — only for done jobs */}
      {isDone && (
        <div className="px-4 pb-3 flex items-center gap-2 border-t border-white/5 pt-3">
          <a
            href={`/api/jobs/${job.jobId}/download?type=mp4`}
            className="flex-1 text-center text-xs font-medium py-1.5 rounded-md ring-1 ring-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            title="Download MP4"
            onClick={(e) => e.stopPropagation()}
          >
            ↓ MP4
          </a>
          <a
            href={`/api/jobs/${job.jobId}/download?type=storyboard`}
            className="flex-1 text-center text-xs font-medium py-1.5 rounded-md ring-1 ring-white/10 bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-colors"
            title="Download Storyboard JSON"
            onClick={(e) => e.stopPropagation()}
          >
            ↓ JSON
          </a>
          <Link
            href={`/create?forkId=${job.jobId}`}
            className="flex-1 text-center text-xs font-medium py-1.5 rounded-md ring-1 ring-brand-500/30 bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 hover:text-brand-200 transition-colors"
            title="Fork & Edit"
            onClick={(e) => e.stopPropagation()}
          >
            ⑂ Fork
          </Link>
        </div>
      )}

      {/* Watermark upgrade hint — free tier + done */}
      {isDone && tier === 'free' && (
        <div className="px-4 pb-3">
          <Link
            href="/billing"
            className="flex items-center gap-2 text-[11px] text-amber-300/80 hover:text-amber-200 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            <span>⚡</span>
            <span>Upgrade to Pro to remove the watermark</span>
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5.4: Create `apps/web/src/lib/tier.ts`**

The `HistoryCard` imports `Tier` from `../../lib/tier`. Create this file:

```typescript
export type Tier = 'free' | 'pro' | 'max';
```

- [ ] **Step 5.5: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- src/tests/HistoryCard.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5.6: Commit**

```bash
git add apps/web/src/components/history/HistoryCard.tsx apps/web/src/lib/tier.ts apps/web/src/tests/HistoryCard.test.tsx
git commit -m "feat(web): HistoryCard — action row (Download/Fork) + Free-tier watermark hint"
```

---

## Task 6: Update `HistoryGrid` to Pass `tier` to Cards

**Files:**
- Modify: `apps/web/src/components/HistoryGrid.tsx`

- [ ] **Step 6.1: Write the failing test**

Open `apps/web/src/tests/HistoryGrid.test.tsx` (create if needed). Add one test that confirms the grid fetches `tier` and passes it through. Because `HistoryGrid` does a real `fetch`, mock it:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: { div: (props: Record<string, unknown>) => <div {...props} /> },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

global.fetch = vi.fn();

import { HistoryGrid } from '../../components/HistoryGrid';

describe('HistoryGrid', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('renders upgrade hint for a free-tier done job', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        jobs: [{
          jobId: 'j1',
          parentJobId: null,
          status: 'done',
          stage: 'render',
          input: { url: 'https://x.com', intent: 'Demo', duration: 30 },
          videoUrl: 's3://b/v.mp4',
          thumbUrl: null,
          coverUrl: null,
          createdAt: Date.now() - 1000,
          parent: null,
        }],
        hasMore: false,
        tier: 'free',
      }),
    });
    render(<HistoryGrid />);
    await waitFor(() => {
      expect(screen.getByText(/upgrade/i)).toBeTruthy();
    });
  });
});
```

- [ ] **Step 6.2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- src/tests/HistoryGrid.test.tsx
```

Expected: FAIL — HistoryGrid doesn't pass `tier` to HistoryCard yet, so "Upgrade" text not found.

- [ ] **Step 6.3: Update `HistoryGrid.tsx`**

In `apps/web/src/components/HistoryGrid.tsx`:

**Change 1** — Update the `FetchState` interface to add `tier`:

```typescript
interface FetchState {
  jobs: HistoryJob[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  tier: 'free' | 'pro' | 'max';
}
```

**Change 2** — Update initial state:

```typescript
  const [state, setState] = useState<FetchState>({
    jobs: [],
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: null,
    tier: 'free',
  });
```

**Change 3** — In the initial fetch effect, update the `body` type and state assignment:

```typescript
        const body = (await res.json()) as { jobs: HistoryJob[]; hasMore: boolean; tier?: 'free' | 'pro' | 'max' };
        const jobs = body.jobs ?? [];
        setState({ jobs, hasMore: body.hasMore, loading: false, loadingMore: false, error: null, tier: body.tier ?? 'free' });
```

**Change 4** — In the `<HistoryCard>` render, pass `tier`:

```tsx
              <HistoryCard job={j} tier={state.tier} />
```

- [ ] **Step 6.4: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- src/tests/HistoryGrid.test.tsx
```

Expected: 1 test passes.

- [ ] **Step 6.5: Run full web test suite**

```bash
cd apps/web && pnpm test
```

Expected: all tests pass.

- [ ] **Step 6.6: Commit**

```bash
git add apps/web/src/components/HistoryGrid.tsx apps/web/src/tests/HistoryGrid.test.tsx
git commit -m "feat(web): HistoryGrid passes tier to HistoryCard for watermark hint"
```

---

## Task 7: Fork & Edit — `create/page.tsx` + `CreatePageBody.tsx`

**Files:**
- Modify: `apps/web/src/app/create/page.tsx`
- Modify: `apps/web/src/components/CreatePageBody.tsx`

- [ ] **Step 7.1: Write the failing test**

Create `apps/web/src/tests/CreatePageBody.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { CreatePageBody } from '../../components/CreatePageBody';

describe('CreatePageBody fork mode', () => {
  it('prefills URL and intent when fork prop is supplied', () => {
    render(
      <CreatePageBody
        fork={{
          parentJobId: 'parent-1',
          url: 'https://fork.example.com',
          intent: 'Forked intent',
          duration: 30,
        }}
      />,
    );
    const urlInput = screen.getByDisplayValue('https://fork.example.com') as HTMLInputElement;
    expect(urlInput.value).toBe('https://fork.example.com');
    const intentInput = screen.getByDisplayValue('Forked intent') as HTMLTextAreaElement;
    expect(intentInput.value).toBe('Forked intent');
  });

  it('does NOT auto-submit when fork prop is supplied', () => {
    const submit = vi.fn();
    render(
      <CreatePageBody
        fork={{ parentJobId: 'p1', url: 'https://x.com', intent: 'x', duration: 10 }}
        _testSubmit={submit}
      />,
    );
    // After render + any effects, submit should not have been called
    expect(submit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7.2: Run test to verify it fails**

```bash
cd apps/web && pnpm test -- src/tests/CreatePageBody.test.tsx
```

Expected: TypeScript error — `fork` prop not on `CreatePageBody`.

- [ ] **Step 7.3: Update `CreatePageBody.tsx`**

Replace the full content of `apps/web/src/components/CreatePageBody.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { JobForm } from './JobForm';
import { LandingBackdrop } from './landing/LandingBackdrop';
import { createJob } from '../lib/api';
import { API_BASE } from '../lib/config';
import type { Prefill } from '../lib/prefill';
import type { JobInput } from '../lib/types';

export interface ForkInfo {
  parentJobId: string;
  url: string;
  intent: string;
  duration: 10 | 30 | 60;
  hint?: string;
}

export interface CreatePageBodyProps {
  prefill?: Prefill;
  initialUrl?: string;
  fork?: ForkInfo;
  /** Test-only: override the submit function to spy on calls */
  _testSubmit?: (input: JobInput) => Promise<{ jobId: string }>;
}

export function CreatePageBody({ prefill, initialUrl, fork, _testSubmit }: CreatePageBodyProps) {
  const router = useRouter();
  const submittedRef = useRef(false);

  const submit = _testSubmit ?? (async (input: JobInput) => {
    const res = await createJob(input, API_BASE);
    router.push(`/jobs/${res.jobId}`);
    return res;
  });

  // Auto-submit only for prefill (OAuth return flow), NOT for fork.
  useEffect(() => {
    if (!prefill || submittedRef.current) return;
    submittedRef.current = true;
    void submit({ url: prefill.url, intent: prefill.intent, duration: prefill.duration });
  }, [prefill]);

  const jobFormProps = fork
    ? {
        initialUrl: fork.url,
        initialIntent: fork.intent,
        initialDuration: fork.duration,
        initialHint: fork.hint,
        parentJobId: fork.parentJobId,
      }
    : prefill
      ? { initialUrl: prefill.url, initialIntent: prefill.intent, initialDuration: prefill.duration }
      : initialUrl
        ? { initialUrl }
        : {};

  return (
    <LandingBackdrop className="min-h-[calc(100vh-65px)]">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <motion.header
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <h1
            className="font-extrabold tracking-tight text-transparent bg-clip-text leading-tight"
            style={{
              backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
              fontSize: 'clamp(28px, 4vw, 44px)',
              letterSpacing: '-0.02em',
            }}
          >
            {fork ? 'Fork & edit this video.' : 'Turn any URL into a demo video.'}
          </h1>
          <p className="mt-3 text-sm text-gray-400 leading-relaxed">
            {fork
              ? 'Pre-filled from the original job. Edit the intent or hint, then create.'
              : 'Paste a product URL, describe what to emphasize, and get a 10/30/60-second demo rendered with Remotion.'}
          </p>
        </motion.header>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, type: 'spring', stiffness: 80, damping: 20 }}
          className="rounded-2xl p-8 ring-1 ring-white/10 bg-white/5 backdrop-blur-md"
          style={{ boxShadow: '0 0 60px rgba(109,40,217,0.08)' }}
        >
          <JobForm onSubmit={submit} {...jobFormProps} />
        </motion.div>
      </div>
    </LandingBackdrop>
  );
}
```

- [ ] **Step 7.4: Update `create/page.tsx` to handle `forkId`**

Replace `apps/web/src/app/create/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { CreatePageBody, type ForkInfo } from '../../components/CreatePageBody';
import { decodePrefill } from '../../lib/prefill';
import { auth, isAuthEnabled } from '../../auth';
import { getPool } from '../../lib/pg';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { prefill?: string; url?: string; forkId?: string };
}

export default async function CreatePage({ searchParams }: PageProps) {
  const prefill = searchParams.prefill ? decodePrefill(searchParams.prefill) : null;

  // Fork prefill: load parent job server-side (auth-gated ownership check).
  let fork: ForkInfo | undefined;
  if (searchParams.forkId && isAuthEnabled() && auth) {
    const session = await auth();
    const userId = (session?.user as { id?: string } | null)?.id;
    if (!userId) {
      redirect(`/api/auth/signin?callbackUrl=/create?forkId=${searchParams.forkId}`);
    }
    try {
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id, input FROM jobs WHERE id = $1 AND user_id = $2 LIMIT 1`,
        [searchParams.forkId, Number(userId)],
      );
      if (rows.length > 0) {
        const row = rows[0] as { id: string; input: { url: string; intent: string; duration: 10 | 30 | 60; hint?: string } };
        fork = {
          parentJobId: row.id,
          url: row.input.url,
          intent: row.input.intent,
          duration: row.input.duration,
          hint: row.input.hint,
        };
      }
    } catch {
      // Non-fatal: if fork lookup fails, render a clean form
    }
  }

  return (
    <CreatePageBody
      {...(fork ? { fork } : {})}
      {...(!fork && prefill ? { prefill } : {})}
      {...(!fork && !prefill && searchParams.url ? { initialUrl: searchParams.url } : {})}
    />
  );
}
```

- [ ] **Step 7.5: Run test to verify it passes**

```bash
cd apps/web && pnpm test -- src/tests/CreatePageBody.test.tsx
```

Expected: 2 tests pass — URL/intent prefilled correctly, auto-submit NOT called for fork.

- [ ] **Step 7.6: Run full web test suite**

```bash
cd apps/web && pnpm test
```

Expected: all tests pass.

- [ ] **Step 7.7: Commit**

```bash
git add apps/web/src/app/create/page.tsx apps/web/src/components/CreatePageBody.tsx apps/web/src/tests/CreatePageBody.test.tsx
git commit -m "feat(web): fork & edit — forkId prefill on /create with skip-crawl parent"
```

---

## Final Verification

- [ ] **Step 8.1: Full monorepo test run**

```bash
cd c:/Users/88698/Desktop/Workspace/promptdemo && pnpm -r test
```

Expected: all tests pass across all packages.

- [ ] **Step 8.2: Acceptance criteria check**

1. **Footer** — `/about`, `/blog`, `/careers` etc. each render the Coming Soon page with the correct heading; the main landing page footer shows 4 columns and GitHub/Twitter/Discord icons.
2. **Download** — On the history page, a Done job shows "↓ MP4" and "↓ JSON" links; clicking either triggers a file download via the presigned redirect.
3. **Fork** — Clicking "⑂ Fork" on a history card opens `/create?forkId=…` with the form pre-filled; submitting creates a new job using the parent's crawl result.
4. **Watermark hint** — A Free-tier user sees "Upgrade to Pro to remove the watermark" on done cards; a Pro user does not.
