# Marketing Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a public-facing marketing landing page at `/` for signed-out visitors that converts via a split hero (preview form + dogfooded MP4) and a 3-feature grid; signed-in users transparently see the existing job-creation form.

**Architecture:** Server-rendered conditional `/` reads the NextAuth session and dispatches between `<MarketingLanding/>` and the existing form (extracted into a shared `<CreatePageBody/>` for reuse). The form on the marketing hero is a client component that intercepts submit-when-signed-out, base64-encodes `{url, intent, duration}` into a `?prefill=` query, and bounces through `/api/auth/signin` to land on `/create` where the prefill auto-submits. The hero MP4 is a static asset shipped from `public/`. All visual primitives (backdrop, headline, glassmorphism cards) reuse the v2.1 Phase 4 baseline (Inter, framer-motion, brand-violet glow).

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind 3, framer-motion, NextAuth v5, Vitest + @testing-library/react.

---

## Spec reference

[docs/superpowers/specs/2026-04-25-marketing-landing-page-design.md](../specs/2026-04-25-marketing-landing-page-design.md) (v2 post-review). Read the 8 brainstorm decisions and the page architecture section before starting Task 1.

---

## File structure

**New files:**

```
apps/web/
  public/
    landing-hero-demo.mp4              # COPY from docs/readme/landing-hero-demo.mp4
  src/
    app/
      create/
        page.tsx                       # NEW — moved from current /page.tsx + prefill decoder
      landing-preview/
        page.tsx                       # NEW — dev-only, always renders MarketingLanding
    components/
      CreatePageBody.tsx               # NEW — shared form body (used by / signed-in + /create)
      landing/
        MarketingLanding.tsx           # NEW — orchestrates the 4 sections
        LandingBackdrop.tsx            # NEW — violet bloom + grid pattern, reusable
        LandingHero.tsx                # NEW — split layout, headline + form + video
        LandingFeatures.tsx            # NEW — 3-column feature grid
        LandingFinalCTA.tsx            # NEW — bottom CTA section
        LandingFooter.tsx              # NEW — 2-row footer
        PreviewForm.tsx                # NEW — wraps JobForm, intercepts submit-when-signed-out
    lib/
      prefill.ts                       # NEW — encode/decode helpers, redirect-URL builder

  tests/
    lib/prefill.test.ts                # NEW
    components/landing/
      LandingBackdrop.test.tsx         # NEW
      PreviewForm.test.tsx             # NEW
      LandingHero.test.tsx             # NEW
      LandingFeatures.test.tsx         # NEW
      LandingFinalCTA.test.tsx         # NEW
      LandingFooter.test.tsx           # NEW
      MarketingLanding.test.tsx        # NEW
      CreatePageBody.test.tsx          # NEW
```

**Modified files:**

```
apps/web/src/app/page.tsx              # REWRITE — server component, conditional render
```

**No backend changes.** This is a pure apps/web feature. No DB migrations, no apps/api routes, no env vars.

---

## Task 1: Foundation — copy MP4 + create LandingBackdrop

**Files:**
- Copy: `docs/readme/landing-hero-demo.mp4` → `apps/web/public/landing-hero-demo.mp4`
- Create: `apps/web/src/components/landing/LandingBackdrop.tsx`
- Create: `apps/web/tests/components/landing/LandingBackdrop.test.tsx`

- [ ] **Step 1: Copy the demo MP4 into public/**

```bash
cp docs/readme/landing-hero-demo.mp4 apps/web/public/landing-hero-demo.mp4
```

- [ ] **Step 2: Verify it copied**

```bash
ls -la apps/web/public/landing-hero-demo.mp4
```

Expected: file size ≥ 1 MB.

- [ ] **Step 3: Write the failing test**

`apps/web/tests/components/landing/LandingBackdrop.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LandingBackdrop } from '../../../src/components/landing/LandingBackdrop';

describe('LandingBackdrop', () => {
  it('renders an absolutely-positioned div with brand-violet bloom + grid pattern', () => {
    const { container } = render(<LandingBackdrop />);
    const root = container.firstChild as HTMLElement;
    expect(root).toBeTruthy();
    // Decorative-only — must be aria-hidden so the gradient isn't read by SR.
    expect(root.getAttribute('aria-hidden')).toBe('true');
    // Has at least one child for the grid overlay.
    expect(root.children.length).toBeGreaterThanOrEqual(1);
    // Inline-style or class for the radial bloom — accept either.
    expect(root.outerHTML).toMatch(/(radial-gradient|bg-)/);
  });

  it('renders children inside the backdrop frame', () => {
    const { getByText } = render(
      <LandingBackdrop>
        <div>hero contents</div>
      </LandingBackdrop>,
    );
    expect(getByText('hero contents')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
pnpm -F @lumespec/web test tests/components/landing/LandingBackdrop.test.tsx
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 5: Implement LandingBackdrop**

`apps/web/src/components/landing/LandingBackdrop.tsx`:

```tsx
import type { ReactNode } from 'react';

/**
 * Reusable visual backdrop for landing-page sections. Layers two violet
 * radial blooms over a near-black base, with a subtle 40px grid pattern
 * overlay. Decorative only — children render above the gradient.
 */
export interface LandingBackdropProps {
  children?: ReactNode;
  className?: string;
}

export function LandingBackdrop({ children, className = '' }: LandingBackdropProps) {
  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden ${className}`}
      style={{
        background:
          'radial-gradient(circle at 25% 50%, rgba(109, 40, 217, 0.45), transparent 60%),' +
          ' radial-gradient(circle at 80% 30%, rgba(167, 139, 250, 0.25), transparent 50%),' +
          ' #0a0a14',
      }}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-70 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(167, 139, 250, 0.06) 1px, transparent 1px),' +
            ' linear-gradient(90deg, rgba(167, 139, 250, 0.06) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm -F @lumespec/web test tests/components/landing/LandingBackdrop.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/public/landing-hero-demo.mp4 apps/web/src/components/landing/LandingBackdrop.tsx apps/web/tests/components/landing/LandingBackdrop.test.tsx
git commit -m "feat(landing): LandingBackdrop primitive + serve demo MP4 from public/"
```

---

## Task 2: Prefill encoder/decoder + redirect-URL builder

**Files:**
- Create: `apps/web/src/lib/prefill.ts`
- Create: `apps/web/tests/lib/prefill.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/lib/prefill.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodePrefill, decodePrefill, signInRedirectFor } from '../../src/lib/prefill';

describe('encodePrefill / decodePrefill', () => {
  it('round-trips url + intent + duration through base64', () => {
    const input = { url: 'https://x.com', intent: 'show pricing', duration: 30 } as const;
    const encoded = encodePrefill(input);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/); // url-safe base64
    const decoded = decodePrefill(encoded);
    expect(decoded).toEqual(input);
  });

  it('handles unicode intent (Chinese) without corruption', () => {
    const input = { url: 'https://x.com', intent: '行銷影片：強調速度', duration: 60 } as const;
    expect(decodePrefill(encodePrefill(input))).toEqual(input);
  });

  it('decodePrefill returns null on malformed input', () => {
    expect(decodePrefill('not-base64!!!')).toBeNull();
    expect(decodePrefill('')).toBeNull();
    expect(decodePrefill('aGVsbG8')).toBeNull(); // valid base64 but not our shape
  });

  it('decodePrefill returns null on missing required fields', () => {
    const partial = btoa(JSON.stringify({ url: 'https://x.com' }));
    expect(decodePrefill(partial)).toBeNull();
  });
});

describe('signInRedirectFor', () => {
  it('builds a NextAuth signin URL with the prefill carried via callbackUrl', () => {
    const url = signInRedirectFor({
      url: 'https://x.com',
      intent: 'show pricing',
      duration: 30,
    });
    expect(url).toMatch(/^\/api\/auth\/signin\?callbackUrl=/);
    // callbackUrl is URL-encoded; decode to inspect.
    const params = new URLSearchParams(url.split('?')[1]);
    const callback = params.get('callbackUrl');
    expect(callback).toBeTruthy();
    expect(callback).toMatch(/^\/create\?prefill=/);
    const prefill = new URL(callback!, 'http://x').searchParams.get('prefill');
    expect(prefill).toBeTruthy();
    expect(decodePrefill(prefill!)).toEqual({
      url: 'https://x.com',
      intent: 'show pricing',
      duration: 30,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @lumespec/web test tests/lib/prefill.test.ts
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement the helpers**

`apps/web/src/lib/prefill.ts`:

```ts
/**
 * Submit-when-signed-out interception helpers. The marketing-page form
 * captures intent before the user has an account; we encode it onto the
 * sign-in callback URL so the post-OAuth landing page (/create) can
 * hydrate + auto-submit.
 *
 * Encoding: URL-safe base64 of JSON. Tested up to 500-char Chinese intent.
 * If we ever hit the 2KB callbackUrl ceiling in practice, swap for the
 * localStorage approach (see followup #pending-prefill-storage in spec).
 */
export interface Prefill {
  url: string;
  intent: string;
  duration: 10 | 30 | 60;
}

function urlSafeB64Encode(s: string): string {
  // btoa works on ASCII only — encode UTF-8 first.
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function urlSafeB64Decode(s: string): string | null {
  try {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export function encodePrefill(p: Prefill): string {
  return urlSafeB64Encode(JSON.stringify(p));
}

export function decodePrefill(s: string): Prefill | null {
  if (!s) return null;
  const json = urlSafeB64Decode(s);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<Prefill>;
    if (typeof parsed.url !== 'string' || parsed.url.length === 0) return null;
    if (typeof parsed.intent !== 'string' || parsed.intent.length === 0) return null;
    if (parsed.duration !== 10 && parsed.duration !== 30 && parsed.duration !== 60) return null;
    return { url: parsed.url, intent: parsed.intent, duration: parsed.duration };
  } catch {
    return null;
  }
}

export function signInRedirectFor(p: Prefill): string {
  const prefill = encodePrefill(p);
  const callback = `/create?prefill=${prefill}`;
  return `/api/auth/signin?callbackUrl=${encodeURIComponent(callback)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -F @lumespec/web test tests/lib/prefill.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/prefill.ts apps/web/tests/lib/prefill.test.ts
git commit -m "feat(landing): prefill encoder + signin-redirect URL builder"
```

---

## Task 3: PreviewForm — auth-aware form wrapper

**Files:**
- Create: `apps/web/src/components/landing/PreviewForm.tsx`
- Create: `apps/web/tests/components/landing/PreviewForm.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/components/landing/PreviewForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next-auth/react', () => ({
  useSession: vi.fn(),
}));

import { useSession } from 'next-auth/react';
import { PreviewForm } from '../../../src/components/landing/PreviewForm';

describe('PreviewForm', () => {
  const originalLocation = window.location;
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...originalLocation, href: 'http://localhost:3001/', assign: vi.fn() },
    });
  });

  it('renders the JobForm fields (URL, intent, duration, submit)', () => {
    vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated' } as never);
    render(<PreviewForm onAuthedSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/intent/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/duration/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create video|try free/i })).toBeInTheDocument();
  });

  it('signed-out submit redirects to /api/auth/signin with prefill in callbackUrl', async () => {
    vi.mocked(useSession).mockReturnValue({ data: null, status: 'unauthenticated' } as never);
    const onAuthedSubmit = vi.fn();
    render(<PreviewForm onAuthedSubmit={onAuthedSubmit} />);
    fireEvent.change(screen.getByLabelText(/url/i), { target: { value: 'https://x.com' } });
    fireEvent.change(screen.getByLabelText(/intent/i), { target: { value: 'show pricing' } });
    fireEvent.click(screen.getByRole('button', { name: /create video|try free/i }));

    // Wait microtask for async submit handler.
    await new Promise((res) => setTimeout(res, 0));

    expect(onAuthedSubmit).not.toHaveBeenCalled();
    expect(window.location.href).toMatch(/\/api\/auth\/signin/);
    expect(window.location.href).toContain('callbackUrl=');
    expect(window.location.href).toContain('prefill=');
  });

  it('signed-in submit invokes onAuthedSubmit with the form values', async () => {
    vi.mocked(useSession).mockReturnValue({
      data: { user: { id: '1', email: 'a@b' } },
      status: 'authenticated',
    } as never);
    const onAuthedSubmit = vi.fn().mockResolvedValue({ jobId: 'abc' });
    render(<PreviewForm onAuthedSubmit={onAuthedSubmit} />);
    fireEvent.change(screen.getByLabelText(/url/i), { target: { value: 'https://x.com' } });
    fireEvent.change(screen.getByLabelText(/intent/i), { target: { value: 'show pricing' } });
    fireEvent.click(screen.getByRole('button', { name: /create video|try free/i }));

    await new Promise((res) => setTimeout(res, 0));

    expect(onAuthedSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://x.com', intent: 'show pricing' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @lumespec/web test tests/components/landing/PreviewForm.test.tsx
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement PreviewForm**

`apps/web/src/components/landing/PreviewForm.tsx`:

```tsx
'use client';

import { useSession } from 'next-auth/react';
import { JobForm } from '../JobForm';
import type { JobInput } from '../../lib/types';
import { signInRedirectFor } from '../../lib/prefill';

export interface PreviewFormProps {
  /**
   * Called only when the user is signed in. Same signature as the JobForm
   * `onSubmit` prop the existing /create flow uses.
   */
  onAuthedSubmit: (input: JobInput) => Promise<{ jobId: string }>;
  initialHint?: string;
}

/**
 * Wraps <JobForm/> for the marketing landing page. When the user submits
 * while signed-out, we don't fail — we capture the intent and bounce to
 * sign-in, with the form values carried via `?prefill=<base64>` on the
 * post-auth callback URL. /create reads it and auto-submits.
 *
 * Signed-in users get the normal submit path.
 */
export function PreviewForm({ onAuthedSubmit, initialHint }: PreviewFormProps) {
  const { status } = useSession();

  const handleSubmit = async (input: JobInput): Promise<{ jobId: string }> => {
    if (status === 'authenticated') {
      return onAuthedSubmit(input);
    }
    const redirect = signInRedirectFor({
      url: input.url,
      intent: input.intent,
      duration: input.duration,
    });
    window.location.href = redirect;
    // Return a never-resolving promise so JobForm's "pending" state stays on
    // until navigation kicks in. Throwing or resolving would flash the form
    // back to its idle state mid-redirect.
    return new Promise(() => {});
  };

  return <JobForm onSubmit={handleSubmit} {...(initialHint ? { initialHint } : {})} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -F @lumespec/web test tests/components/landing/PreviewForm.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/PreviewForm.tsx apps/web/tests/components/landing/PreviewForm.test.tsx
git commit -m "feat(landing): PreviewForm wraps JobForm with signin interception"
```

---

## Task 4: LandingHero — split layout

**Files:**
- Create: `apps/web/src/components/landing/LandingHero.tsx`
- Create: `apps/web/tests/components/landing/LandingHero.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/components/landing/LandingHero.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

import { LandingHero } from '../../../src/components/landing/LandingHero';

describe('LandingHero', () => {
  it('renders the locked headline copy on three lines', () => {
    render(<LandingHero onAuthedSubmit={vi.fn()} />);
    expect(screen.getByText(/From URL/i)).toBeInTheDocument();
    expect(screen.getByText(/to demo video/i)).toBeInTheDocument();
    expect(screen.getByText(/Sixty seconds/i)).toBeInTheDocument();
  });

  it('renders the subhead naming Claude + Remotion', () => {
    render(<LandingHero onAuthedSubmit={vi.fn()} />);
    expect(screen.getByText(/Claude \+ Remotion/i)).toBeInTheDocument();
  });

  it('renders an autoplay/loop/muted/playsinline video pointing at /landing-hero-demo.mp4', () => {
    const { container } = render(<LandingHero onAuthedSubmit={vi.fn()} />);
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('autoplay')).not.toBeNull();
    expect(video?.getAttribute('loop')).not.toBeNull();
    expect(video?.getAttribute('muted')).not.toBeNull();
    expect(video?.getAttribute('playsinline')).not.toBeNull();
    const src = video?.querySelector('source')?.getAttribute('src') ?? video?.getAttribute('src');
    expect(src).toBe('/landing-hero-demo.mp4');
  });

  it('renders the form (URL field is the proof — wrapped by PreviewForm)', () => {
    render(<LandingHero onAuthedSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @lumespec/web test tests/components/landing/LandingHero.test.tsx
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement LandingHero**

`apps/web/src/components/landing/LandingHero.tsx`:

```tsx
'use client';

import type { JobInput } from '../../lib/types';
import { LandingBackdrop } from './LandingBackdrop';
import { PreviewForm } from './PreviewForm';

export interface LandingHeroProps {
  onAuthedSubmit: (input: JobInput) => Promise<{ jobId: string }>;
}

export function LandingHero({ onAuthedSubmit }: LandingHeroProps) {
  return (
    <LandingBackdrop className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-16 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* LEFT — copy + form (5/12) */}
          <div className="lg:col-span-5">
            <div className="text-[11px] tracking-[0.18em] text-brand-300 uppercase font-medium">
              LumeSpec
            </div>
            <h1
              className="mt-3 font-extrabold leading-[1.05] tracking-tight text-transparent bg-clip-text"
              style={{
                backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
                fontSize: 'clamp(40px, 6vw, 72px)',
              }}
            >
              From URL
              <br />
              to demo video.
              <br />
              Sixty seconds.
            </h1>
            <p className="mt-5 text-base lg:text-lg text-gray-400 max-w-md leading-relaxed">
              Paste a link, pick an intent, ship a polished MP4.
              <br />
              Powered by Claude + Remotion.
            </p>
            <div className="mt-8">
              <PreviewForm onAuthedSubmit={onAuthedSubmit} />
            </div>
          </div>

          {/* RIGHT — looping demo video (7/12) */}
          <div className="lg:col-span-7">
            <div
              className="relative rounded-2xl overflow-hidden ring-1 ring-violet-500/20 shadow-2xl shadow-violet-500/10"
              style={{ aspectRatio: '16 / 9' }}
            >
              {/* Decorative violet glow halo */}
              <div
                aria-hidden="true"
                className="absolute -inset-4 rounded-3xl opacity-50 blur-3xl"
                style={{ background: 'radial-gradient(ellipse, rgba(109, 40, 217, 0.5), transparent 70%)' }}
              />
              <video
                className="relative w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-label="LumeSpec example output — vercel.com rendered as a 60-second demo video"
              >
                <source src="/landing-hero-demo.mp4" type="video/mp4" />
              </video>
            </div>
            <p className="mt-3 text-xs text-gray-500 italic text-center">
              Made with LumeSpec. Source: vercel.com
            </p>
          </div>
        </div>
      </div>
    </LandingBackdrop>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -F @lumespec/web test tests/components/landing/LandingHero.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/LandingHero.tsx apps/web/tests/components/landing/LandingHero.test.tsx
git commit -m "feat(landing): LandingHero — split copy/form left + dogfood video right"
```

---

## Task 5: LandingFeatures — 3-column grid

**Files:**
- Create: `apps/web/src/components/landing/LandingFeatures.tsx`
- Create: `apps/web/tests/components/landing/LandingFeatures.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/components/landing/LandingFeatures.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingFeatures } from '../../../src/components/landing/LandingFeatures';

describe('LandingFeatures', () => {
  it('renders the section heading "Ship the demo, not the screenshot."', () => {
    render(<LandingFeatures />);
    expect(screen.getByText(/Ship the demo, not the screenshot\./i)).toBeInTheDocument();
  });

  it('renders all 3 feature titles', () => {
    render(<LandingFeatures />);
    expect(screen.getByText(/Zero-Touch Storyboarding/i)).toBeInTheDocument();
    expect(screen.getByText(/Intent-Driven Directing/i)).toBeInTheDocument();
    expect(screen.getByText(/Studio-Grade Polish/i)).toBeInTheDocument();
  });

  it('each feature has a descriptive body that mentions the underlying tool', () => {
    render(<LandingFeatures />);
    expect(screen.getByText(/Claude/i)).toBeInTheDocument();
    expect(screen.getByText(/pacing profiles/i)).toBeInTheDocument();
    expect(screen.getByText(/Remotion/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @lumespec/web test tests/components/landing/LandingFeatures.test.tsx
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement LandingFeatures**

`apps/web/src/components/landing/LandingFeatures.tsx`:

```tsx
import type { ReactNode } from 'react';

interface Feature {
  icon: ReactNode;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: '✨',
    title: 'Zero-Touch Storyboarding',
    body:
      'Paste a URL. Claude crawls every section, picks the moments worth showing, and sequences them into scenes. You stay out of the timeline.',
  },
  {
    icon: '🧭',
    title: 'Intent-Driven Directing',
    body:
      'Tell us the vibe — marketing trailer, tutorial walkthrough, default. Our pacing profiles auto-tune scene durations, transitions, and rhythm. Same crawl, four different cuts.',
  },
  {
    icon: '🎬',
    title: 'Studio-Grade Polish',
    body:
      'Spring physics. Frame-perfect timing. Real video output, not slideshow exports. Every shot rendered with Remotion at 30fps to broadcast-grade MP4.',
  },
];

export function LandingFeatures() {
  return (
    <section className="bg-[#0a0a14] py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
          <h2
            className="font-bold tracking-tight text-transparent bg-clip-text"
            style={{
              backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
              fontSize: 'clamp(28px, 3.5vw, 44px)',
              letterSpacing: '-0.02em',
            }}
          >
            Ship the demo, not the screenshot.
          </h2>
          <p className="mt-3 text-sm italic text-gray-400">
            Three things make LumeSpec different from the slideshow exporters.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl p-8 ring-1 ring-white/10 bg-white/5 backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:ring-violet-500/30"
            >
              <div
                aria-hidden="true"
                className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-2xl"
              >
                {f.icon}
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">{f.title}</h3>
              <p className="mt-3 text-sm text-gray-400 leading-relaxed">{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -F @lumespec/web test tests/components/landing/LandingFeatures.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/LandingFeatures.tsx apps/web/tests/components/landing/LandingFeatures.test.tsx
git commit -m "feat(landing): LandingFeatures — 3-card grid (Zero-Touch / Intent-Driven / Studio-Grade)"
```

---

## Task 6: LandingFinalCTA — bottom CTA section

**Files:**
- Create: `apps/web/src/components/landing/LandingFinalCTA.tsx`
- Create: `apps/web/tests/components/landing/LandingFinalCTA.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/components/landing/LandingFinalCTA.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingFinalCTA } from '../../../src/components/landing/LandingFinalCTA';

describe('LandingFinalCTA', () => {
  it('renders the closing headline', () => {
    render(<LandingFinalCTA />);
    expect(screen.getByText(/Ready to ship it\?/i)).toBeInTheDocument();
  });

  it('renders the free-tier subline', () => {
    render(<LandingFinalCTA />);
    expect(screen.getByText(/Free tier/i)).toBeInTheDocument();
  });

  it('renders a single primary CTA pointing at /create', () => {
    render(<LandingFinalCTA />);
    const cta = screen.getByRole('link', { name: /Start for free/i });
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/create');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @lumespec/web test tests/components/landing/LandingFinalCTA.test.tsx
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement LandingFinalCTA**

`apps/web/src/components/landing/LandingFinalCTA.tsx`:

```tsx
import Link from 'next/link';
import { LandingBackdrop } from './LandingBackdrop';

export function LandingFinalCTA() {
  return (
    <LandingBackdrop>
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2
          className="font-extrabold tracking-tight text-transparent bg-clip-text"
          style={{
            backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
            fontSize: 'clamp(32px, 4vw, 56px)',
            letterSpacing: '-0.02em',
          }}
        >
          Ready to ship it?
        </h2>
        <p className="mt-4 text-base text-gray-400">
          Free tier ships 30 seconds of render every month. No card to start.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-md bg-brand-500 hover:bg-brand-600 text-white px-6 py-3 font-semibold text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a14]"
            style={{ boxShadow: '0 0 32px rgba(109, 40, 217, 0.6)' }}
          >
            Start for free →
          </Link>
        </div>
      </div>
    </LandingBackdrop>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -F @lumespec/web test tests/components/landing/LandingFinalCTA.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/LandingFinalCTA.tsx apps/web/tests/components/landing/LandingFinalCTA.test.tsx
git commit -m "feat(landing): LandingFinalCTA — bottom Start-for-free section"
```

---

## Task 7: LandingFooter

**Files:**
- Create: `apps/web/src/components/landing/LandingFooter.tsx`
- Create: `apps/web/tests/components/landing/LandingFooter.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/components/landing/LandingFooter.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingFooter } from '../../../src/components/landing/LandingFooter';

describe('LandingFooter', () => {
  it('renders the wordmark', () => {
    render(<LandingFooter />);
    expect(screen.getByText(/LumeSpec/i)).toBeInTheDocument();
  });

  it('renders three link clusters', () => {
    render(<LandingFooter />);
    expect(screen.getByText(/Product/i)).toBeInTheDocument();
    expect(screen.getByText(/Build/i)).toBeInTheDocument();
    expect(screen.getByText(/Legal/i)).toBeInTheDocument();
  });

  it('renders the dogfood credit', () => {
    render(<LandingFooter />);
    expect(screen.getByText(/Made with LumeSpec. Of course\./i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @lumespec/web test tests/components/landing/LandingFooter.test.tsx
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement LandingFooter**

`apps/web/src/components/landing/LandingFooter.tsx`:

```tsx
import Link from 'next/link';

const PRODUCT = [
  { label: 'Pricing', href: '/billing' },
  { label: 'Roadmap', href: '/' },
  { label: 'Status', href: '/' },
];
const BUILD = [
  { label: 'Source', href: 'https://github.com/chadcoco1444/LumeSpec' },
  { label: 'Architecture', href: '/' },
  { label: 'Design decisions', href: '/' },
];
const LEGAL = [
  { label: 'Privacy', href: '/' },
  { label: 'Terms', href: '/' },
  { label: 'Contact', href: 'mailto:hi@lumespec.dev' },
];

function LinkCluster({ heading, links }: { heading: string; links: typeof PRODUCT }) {
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

export function LandingFooter() {
  return (
    <footer className="bg-[#0a0a14] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <LinkCluster heading="Product" links={PRODUCT} />
          <LinkCluster heading="Build" links={BUILD} />
          <LinkCluster heading="Legal" links={LEGAL} />
        </div>
        <div className="mt-16 pt-6 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-xs text-gray-500">
          <div>
            <span className="font-semibold text-gray-300">LumeSpec</span>
            <span className="ml-3 italic">Made with LumeSpec. Of course.</span>
          </div>
          <div>© 2026 LumeSpec · v2.1</div>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -F @lumespec/web test tests/components/landing/LandingFooter.test.tsx
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/LandingFooter.tsx apps/web/tests/components/landing/LandingFooter.test.tsx
git commit -m "feat(landing): LandingFooter — link clusters + dogfood credit"
```

---

## Task 8: MarketingLanding orchestrator

**Files:**
- Create: `apps/web/src/components/landing/MarketingLanding.tsx`
- Create: `apps/web/tests/components/landing/MarketingLanding.test.tsx`

- [ ] **Step 1: Write the failing test**

`apps/web/tests/components/landing/MarketingLanding.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

import { MarketingLanding } from '../../../src/components/landing/MarketingLanding';

describe('MarketingLanding', () => {
  it('renders all four sections in order: Hero, Features, FinalCTA, Footer', () => {
    render(<MarketingLanding onAuthedSubmit={vi.fn()} />);
    // Hero: headline
    expect(screen.getByText(/Sixty seconds/i)).toBeInTheDocument();
    // Features: section heading
    expect(screen.getByText(/Ship the demo, not the screenshot/i)).toBeInTheDocument();
    // Final CTA: closing headline
    expect(screen.getByText(/Ready to ship it/i)).toBeInTheDocument();
    // Footer: link cluster heading
    expect(screen.getByText(/Product/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @lumespec/web test tests/components/landing/MarketingLanding.test.tsx
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement MarketingLanding**

`apps/web/src/components/landing/MarketingLanding.tsx`:

```tsx
'use client';

import type { JobInput } from '../../lib/types';
import { LandingHero } from './LandingHero';
import { LandingFeatures } from './LandingFeatures';
import { LandingFinalCTA } from './LandingFinalCTA';
import { LandingFooter } from './LandingFooter';

export interface MarketingLandingProps {
  onAuthedSubmit: (input: JobInput) => Promise<{ jobId: string }>;
}

export function MarketingLanding({ onAuthedSubmit }: MarketingLandingProps) {
  return (
    <div className="bg-[#0a0a14]">
      <LandingHero onAuthedSubmit={onAuthedSubmit} />
      <LandingFeatures />
      <LandingFinalCTA />
      <LandingFooter />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm -F @lumespec/web test tests/components/landing/MarketingLanding.test.tsx
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/landing/MarketingLanding.tsx apps/web/tests/components/landing/MarketingLanding.test.tsx
git commit -m "feat(landing): MarketingLanding — orchestrates Hero/Features/FinalCTA/Footer"
```

---

## Task 9: Extract `CreatePageBody` from current `/page.tsx`

**Files:**
- Create: `apps/web/src/components/CreatePageBody.tsx`
- Create: `apps/web/tests/components/CreatePageBody.test.tsx`

This isolates the form-page body so both `/` (signed-in branch) and the new `/create` route can render the exact same UI without duplication.

- [ ] **Step 1: Write the failing test**

`apps/web/tests/components/CreatePageBody.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/lib/api', () => ({
  createJob: vi.fn().mockResolvedValue({ jobId: 'abc' }),
}));
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

import { CreatePageBody } from '../../src/components/CreatePageBody';

describe('CreatePageBody', () => {
  it('renders the legacy headline + subhead + JobForm', () => {
    render(<CreatePageBody />);
    expect(screen.getByText(/Turn any URL into a demo video/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
  });

  it('hydrates form values from prefill when provided', () => {
    render(<CreatePageBody prefill={{ url: 'https://x.com', intent: 'show pricing', duration: 30 }} />);
    expect((screen.getByLabelText(/url/i) as HTMLInputElement).value).toBe('https://x.com');
    expect((screen.getByLabelText(/intent/i) as HTMLTextAreaElement).value).toBe('show pricing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm -F @lumespec/web test tests/components/CreatePageBody.test.tsx
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement CreatePageBody**

`apps/web/src/components/CreatePageBody.tsx`:

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { JobForm } from './JobForm';
import { createJob } from '../lib/api';
import { API_BASE } from '../lib/config';
import type { Prefill } from '../lib/prefill';

export interface CreatePageBodyProps {
  /**
   * When provided, the form mounts with these values prefilled and submits
   * automatically once on first mount. Used by /create after a sign-in
   * round-trip from the marketing landing page.
   */
  prefill?: Prefill;
}

export function CreatePageBody({ prefill }: CreatePageBodyProps) {
  const router = useRouter();
  const submittedRef = useRef(false);

  const submit = async (input: { url: string; intent: string; duration: 10 | 30 | 60; parentJobId?: string; hint?: string }) => {
    const res = await createJob(input, API_BASE);
    router.push(`/jobs/${res.jobId}`);
    return res;
  };

  // Auto-submit once when prefill is present.
  useEffect(() => {
    if (!prefill || submittedRef.current) return;
    submittedRef.current = true;
    void submit({ url: prefill.url, intent: prefill.intent, duration: prefill.duration });
  }, [prefill]);

  return (
    <main className="max-w-2xl mx-auto p-8 space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Turn any URL into a demo video</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Paste a product URL, describe what to emphasize, and get a 10/30/60-second demo rendered with Remotion.
        </p>
      </header>
      <JobForm
        onSubmit={submit}
        {...(prefill ? { initialUrl: prefill.url, initialIntent: prefill.intent, initialDuration: prefill.duration } : {})}
      />
    </main>
  );
}
```

- [ ] **Step 4: Extend JobForm to accept `initialUrl` / `initialIntent` / `initialDuration`**

Open `apps/web/src/components/JobForm.tsx`. The current props are `{ onSubmit, initialHint?, parentJobId? }`. Add three optional initial-state fields. Find this block near the top:

```tsx
export interface JobFormProps {
  onSubmit: (input: JobInput) => Promise<{ jobId: string }>;
  initialHint?: string;
  parentJobId?: string;
}
```

Replace with:

```tsx
export interface JobFormProps {
  onSubmit: (input: JobInput) => Promise<{ jobId: string }>;
  initialHint?: string;
  initialUrl?: string;
  initialIntent?: string;
  initialDuration?: 10 | 30 | 60;
  parentJobId?: string;
}
```

Then find the useState lines:

```tsx
  const [url, setUrl] = useState('');
  const [intent, setIntent] = useState(initialHint ?? '');
  const [duration, setDuration] = useState<10 | 30 | 60>(30);
```

Replace with:

```tsx
  const [url, setUrl] = useState(initialUrl ?? '');
  const [intent, setIntent] = useState(initialIntent ?? initialHint ?? '');
  const [duration, setDuration] = useState<10 | 30 | 60>(initialDuration ?? 30);
```

And update the destructured props:

```tsx
export function JobForm({ onSubmit, initialHint, initialUrl, initialIntent, initialDuration, parentJobId }: JobFormProps) {
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm -F @lumespec/web test tests/components/CreatePageBody.test.tsx tests/components/JobForm.test.tsx
```

Expected: all CreatePageBody + JobForm tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/CreatePageBody.tsx apps/web/tests/components/CreatePageBody.test.tsx apps/web/src/components/JobForm.tsx
git commit -m "feat(landing): CreatePageBody + JobForm initialUrl/initialIntent/initialDuration"
```

---

## Task 10: `/create` route with prefill decoder

**Files:**
- Create: `apps/web/src/app/create/page.tsx`

- [ ] **Step 1: Implement the route**

`apps/web/src/app/create/page.tsx`:

```tsx
import { CreatePageBody } from '../../components/CreatePageBody';
import { decodePrefill } from '../../lib/prefill';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: { prefill?: string };
}

export default function CreatePage({ searchParams }: PageProps) {
  const prefill = searchParams.prefill ? decodePrefill(searchParams.prefill) : null;
  return <CreatePageBody {...(prefill ? { prefill } : {})} />;
}
```

- [ ] **Step 2: Smoke-test from the dev server**

Start the dev stack if not running:

```bash
pnpm lume restart
```

Then visit:

```
http://localhost:3001/create
http://localhost:3001/create?prefill=invalidblob
http://localhost:3001/create?prefill=eyJ1cmwiOiJodHRwczovL3guY29tIiwiaW50ZW50Ijoic2hvdyIsImR1cmF0aW9uIjozMH0
```

Expected: all three render the form. The third URL hydrates the form with `https://x.com` / `show` / `30s`. (URL-safe base64 of `{"url":"https://x.com","intent":"show","duration":30}`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/create/page.tsx
git commit -m "feat(landing): /create route with ?prefill base64 decoder"
```

---

## Task 11: Conditional `/` — server reads session, dispatches

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Rewrite the route**

Replace the entire contents of `apps/web/src/app/page.tsx`:

```tsx
import { auth, isAuthEnabled } from '../auth';
import { CreatePageBody } from '../components/CreatePageBody';
import { MarketingLandingClientShell } from '../components/landing/MarketingLandingClientShell';

export const dynamic = 'force-dynamic';

/**
 * Conditional root:
 *   - signed-out  → marketing landing page (high-conversion path)
 *   - signed-in   → existing job-creation form (the muscle-memory path)
 *
 * Server-side session read prevents flicker. AUTH_ENABLED=false → always
 * shows the form (the historical behavior pre-v2.1).
 */
export default async function Root() {
  if (!isAuthEnabled() || !auth) {
    return <CreatePageBody />;
  }
  const session = await auth();
  if (session?.user) {
    return <CreatePageBody />;
  }
  return <MarketingLandingClientShell />;
}
```

- [ ] **Step 2: Create the client shell that wires `onAuthedSubmit`**

`apps/web/src/components/landing/MarketingLandingClientShell.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { MarketingLanding } from './MarketingLanding';
import { createJob } from '../../lib/api';
import { API_BASE } from '../../lib/config';
import type { JobInput } from '../../lib/types';

/**
 * Client-side wrapper around <MarketingLanding/> that wires `onAuthedSubmit`
 * to the existing createJob → router.push flow. Lives separately from the
 * server-rendered / route so that route can stay async/server-only.
 */
export function MarketingLandingClientShell() {
  const router = useRouter();
  const onAuthedSubmit = async (input: JobInput) => {
    const res = await createJob(input, API_BASE);
    router.push(`/jobs/${res.jobId}`);
    return res;
  };
  return <MarketingLanding onAuthedSubmit={onAuthedSubmit} />;
}
```

- [ ] **Step 3: Smoke-test both paths**

Start the dev stack:

```bash
pnpm lume restart
```

Then in the browser:

1. Sign out (`/api/auth/signout`).
2. Visit `http://localhost:3001/` — expected: marketing landing page renders (dark backdrop, "From URL to demo video. Sixty seconds.", looping video on the right).
3. Click `Try free` on the form (without filling) — expected: validation error.
4. Fill URL + intent + click submit — expected: redirect to `/api/auth/signin?callbackUrl=/create?prefill=...`.
5. Sign in with Google — expected: lands on `/create?prefill=...`, form values are hydrated, job auto-submits, you arrive at `/jobs/[id]`.
6. Visit `http://localhost:3001/` again (now signed-in) — expected: form renders directly (no marketing landing).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/src/components/landing/MarketingLandingClientShell.tsx
git commit -m "feat(landing): conditional / — signed-out gets marketing, signed-in gets form"
```

---

## Task 12: Dev-only `/landing-preview` route

**Files:**
- Create: `apps/web/src/app/landing-preview/page.tsx`

- [ ] **Step 1: Implement the route**

`apps/web/src/app/landing-preview/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { MarketingLandingClientShell } from '../../components/landing/MarketingLandingClientShell';

export const dynamic = 'force-dynamic';

/**
 * Dev-only — always renders the marketing landing regardless of session.
 * 404 in production so it doesn't pollute the public surface area.
 */
export default function LandingPreview() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }
  return <MarketingLandingClientShell />;
}
```

- [ ] **Step 2: Smoke-test**

```
http://localhost:3001/landing-preview
```

Expected: marketing landing page renders even when signed in. (In a future production build, this 404s — verified at deploy time, not now.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/landing-preview/page.tsx
git commit -m "feat(landing): /landing-preview dev-only debug route"
```

---

## Task 13: Acceptance — full test suite + typecheck + push

- [ ] **Step 1: Run all web tests**

```bash
pnpm -F @lumespec/web test
```

Expected: all tests pass. Count should be ≥ previous (91) + 8 new test files (LandingBackdrop 2, prefill 5, PreviewForm 3, LandingHero 4, LandingFeatures 3, LandingFinalCTA 3, LandingFooter 3, MarketingLanding 1, CreatePageBody 2 = 26 new tests). Target: ≥ 117.

- [ ] **Step 2: Typecheck the whole monorepo**

```bash
pnpm -r typecheck
```

Expected: clean across all 8 workspaces.

- [ ] **Step 3: Push the branch**

```bash
git push
```

Expected: all task-by-task commits land on `main`.

- [ ] **Step 4: Manual conversion smoke**

In a private/incognito browser:

1. Visit `/` → marketing renders.
2. Submit form with `https://stripe.com` + `Show me the pricing page` + `30s`.
3. Lands on Google sign-in. Sign in.
4. Lands on `/jobs/[id]` with a job already running, status `crawling` or `generating`.

Confirms end-to-end conversion path. If any step fails, file a fix task.

---

## Self-review

**1. Spec coverage:**

- ✅ Page architecture (conditional / + /create + /landing-preview): Tasks 10, 11, 12.
- ✅ Hero layout + headline copy + video attrs: Task 4.
- ✅ Submit-when-signed-out interception with base64 prefill: Tasks 2 + 3 + 9 + 10.
- ✅ Feature grid (3 cards, locked content + section heading): Task 5.
- ✅ Final CTA section: Task 6.
- ✅ Footer: Task 7.
- ✅ MP4 served from public/: Task 1.
- ✅ Visual primitive (LandingBackdrop): Task 1.
- ✅ ui-ux-pro-max conformance: spec table is non-functional but each task uses the listed Tailwind classes (4/8 spacing, focus rings, contrast). No additional task required.
- ✅ Component inventory in spec matches the file structure section above (1 minor addition: `MarketingLandingClientShell` — needed because the `/` route is async/server but `MarketingLanding` reads `useSession`; isolating the client boundary keeps the server route clean. Documented inline in Task 11).
- ✅ Known limitation (prefill URL length): handled in Task 2 helpers; the spec footnote stands.

**2. Placeholder scan:** none. Every step has actual code or actual commands.

**3. Type consistency:**

- `Prefill` defined in `lib/prefill.ts` (Task 2), reused in `CreatePageBody` (Task 9) + `/create/page.tsx` (Task 10).
- `JobInput` is the existing type from `lib/types.ts`, threaded through `MarketingLandingProps` → `LandingHeroProps` → `PreviewFormProps` → `JobForm`. Same name everywhere.
- `MarketingLanding` props match `LandingHero` props (both are `{ onAuthedSubmit: (i: JobInput) => Promise<{jobId:string}> }`). Verified.
- `signInRedirectFor` returns `string` consistently in both spec usage (Task 2 test) and implementation (Task 3).

No fixups needed.
