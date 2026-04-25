# Intent Suggestions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 preset intent chips below the `JobForm` textarea so users can seed a well-crafted intent with one click, removing the blank-page problem and giving us a lever to steer video tone.

**Architecture:** Pure client-side feature inside `apps/web`. A new `intentPresets.ts` module owns the preset data and the `applyPreset(current, preset)` fill/append rule. An `IntentPresets.tsx` component renders the chip row. A tiny `locale.ts` helper picks `en` vs `zh` labels from `navigator.language`. A `telemetry.ts` helper fire-and-forgets a click event via `navigator.sendBeacon` (backend endpoint TBD — no-op until wired). `JobForm.tsx` composes all four.

**Tech Stack:** Next.js 14 App Router · React 18 (client component) · Tailwind 3 · Vitest · `@testing-library/react` · `@testing-library/user-event` · no new deps.

---

## File Structure

### Created
- `apps/web/src/lib/intentPresets.ts` — preset data + `applyPreset()` pure helper.
- `apps/web/src/lib/locale.ts` — `detectLocale(navigatorLanguage)` → `'en' | 'zh'`.
- `apps/web/src/lib/telemetry.ts` — `trackIntentPresetSelected(presetId)` fire-and-forget.
- `apps/web/src/components/IntentPresets.tsx` — chip row UI.
- `apps/web/tests/lib/intentPresets.test.ts`
- `apps/web/tests/lib/locale.test.ts`
- `apps/web/tests/lib/telemetry.test.ts`
- `apps/web/tests/components/IntentPresets.test.tsx`

### Modified
- `apps/web/src/components/JobForm.tsx` — compose chip row under the intent textarea, wire preset selection.
- `apps/web/tests/components/JobForm.test.tsx` — extend with chip-integration tests.

### Untouched (by contract)
- `workers/storyboard/src/prompts/systemPrompt.ts` — Claude must NOT be told about presets; the chip body is plain user-authored intent text.
- `apps/api/**` — intent is already a plain string in the `POST /api/jobs` payload.
- `packages/schema/**` — no Zod changes.

---

## Task 1: `intentPresets.ts` — 5 presets + `applyPreset()` pure helper

**Why first:** everything else imports from this module; start with data + pure logic.

**Files:**
- Create: `apps/web/src/lib/intentPresets.ts`
- Test: `apps/web/tests/lib/intentPresets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/lib/intentPresets.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { INTENT_PRESETS, applyPreset } from '../../src/lib/intentPresets';

describe('INTENT_PRESETS', () => {
  it('exposes exactly 5 presets with the expected ids in order', () => {
    expect(INTENT_PRESETS.map((p) => p.id)).toEqual([
      'executive-summary',
      'tutorial',
      'marketing-hype',
      'technical-deep-dive',
      'customer-success',
    ]);
  });

  it('every preset has non-empty en + zh labels and an English body', () => {
    for (const p of INTENT_PRESETS) {
      expect(p.labels.en.length).toBeGreaterThan(0);
      expect(p.labels.zh.length).toBeGreaterThan(0);
      expect(p.body.length).toBeGreaterThan(40);
      // Body is authored in English (Chinese prompt weaker for Claude per spec).
      // Heuristic: first 40 chars should not contain a CJK character.
      expect(p.body.slice(0, 40)).not.toMatch(/[一-鿿]/);
    }
  });
});

describe('applyPreset', () => {
  const preset = {
    id: 'executive-summary',
    labels: { en: 'Executive Summary', zh: '高階主管摘要' },
    body: 'Emphasize business outcomes.',
  };

  it('returns the preset body verbatim when current is empty', () => {
    expect(applyPreset('', preset)).toBe('Emphasize business outcomes.');
  });

  it('returns the preset body verbatim when current is only whitespace', () => {
    expect(applyPreset('   \n  ', preset)).toBe('Emphasize business outcomes.');
  });

  it('appends with the bilingual-safe [Preset: en-label] marker when current is non-empty', () => {
    const result = applyPreset('show the pricing page', preset);
    expect(result).toBe(
      'show the pricing page\n\n[Preset: Executive Summary]\nEmphasize business outcomes.'
    );
  });

  it('always uses the English label in the append marker regardless of locale', () => {
    // Guards against future refactors that might localize the marker — the
    // marker lives in the intent text sent to Claude, whose prompting is
    // stronger in English.
    const result = applyPreset('existing text', preset);
    expect(result).toContain('[Preset: Executive Summary]');
    expect(result).not.toContain('[Preset: 高階主管摘要]');
  });

  it('does not mutate the preset object', () => {
    const snapshot = JSON.stringify(preset);
    applyPreset('anything', preset);
    expect(JSON.stringify(preset)).toBe(snapshot);
  });

  it('is a no-op when the same preset was already applied (dedup on double-click)', () => {
    // Clicking the same chip twice shouldn't stuff the intent with duplicates.
    // Detection rule: the current text already contains the preset body verbatim.
    const once = applyPreset('', preset);
    const twice = applyPreset(once, preset);
    expect(twice).toBe(once);
  });

  it('is also a no-op when the preset was applied via append mode and then re-clicked', () => {
    const withAppend = applyPreset('existing text', preset);
    const reclick = applyPreset(withAppend, preset);
    expect(reclick).toBe(withAppend);
  });

  it('still allows appending a DIFFERENT preset after one is already applied', () => {
    const tutorial = {
      id: 'tutorial',
      labels: { en: 'Tutorial / Walkthrough', zh: '教學版' },
      body: 'Walk through the product step-by-step.',
    };
    const first = applyPreset('', preset);
    const second = applyPreset(first, tutorial);
    expect(second).toContain(preset.body);
    expect(second).toContain('[Preset: Tutorial / Walkthrough]');
    expect(second).toContain(tutorial.body);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lumespec/web test -- intentPresets.test.ts`
Expected: FAIL — "Cannot find module '../../src/lib/intentPresets'".

- [ ] **Step 3: Implement the module**

Create `apps/web/src/lib/intentPresets.ts`:

```ts
export interface IntentPreset {
  /** Stable identifier for telemetry. Never change once shipped. */
  id: string;
  labels: { en: string; zh: string };
  /** Body text spliced into the intent. Always English — Claude prompts
   *  more reliably in English, and the storyboard worker's system prompt
   *  is English too. */
  body: string;
}

export const INTENT_PRESETS: IntentPreset[] = [
  {
    id: 'executive-summary',
    labels: { en: 'Executive Summary', zh: '高階主管摘要' },
    body: [
      'Emphasize business outcomes, time savings, and ROI.',
      'Keep pacing deliberate. Close on the single strongest value proposition.',
      'Tone: authoritative, calm.',
    ].join(' '),
  },
  {
    id: 'tutorial',
    labels: { en: 'Tutorial / Walkthrough', zh: '教學版' },
    body: [
      'Walk through the product step-by-step as a first-time user would experience it.',
      'Show the starting state, the key action, then the result.',
      'Include screenshots of the UI where helpful.',
      'Tone: instructive, clear, patient.',
    ].join(' '),
  },
  {
    id: 'marketing-hype',
    labels: { en: 'Marketing Hype', zh: '行銷版' },
    body: [
      'High-energy promotional spot.',
      'Short punchy scene durations. Emphasize speed, results, and aesthetic.',
      'Use a single powerful tagline.',
      'Tone: energetic, modern.',
    ].join(' '),
  },
  {
    id: 'technical-deep-dive',
    labels: { en: 'Technical Deep-Dive', zh: '技術向' },
    body: [
      'Speak to a developer audience.',
      'Emphasize architecture, integrations, and engineering decisions.',
      'Highlight data flows and performance characteristics.',
      'Tone: precise, substantive, respectful of expertise.',
    ].join(' '),
  },
  {
    id: 'customer-success',
    labels: { en: 'Customer Success Story', zh: '客戶案例' },
    body: [
      'Frame as a user journey: the problem, the before state, adopting the tool,',
      'then the after state with measurable results.',
      'Use testimonial-style beats.',
      'Tone: narrative, empathetic, outcome-focused.',
    ].join(' '),
  },
];

/**
 * Pure fill/append rule used when a chip is clicked.
 *
 * Rules, in order:
 *   1. Dedup — if the preset body already appears verbatim in `current`, return
 *      unchanged. Guards against double-click / same-chip-twice stuffing the
 *      textarea with duplicate preset copies.
 *   2. Empty / whitespace-only current → return the preset body verbatim (fill mode).
 *   3. Otherwise → append on a blank line, prefixed with [Preset: <en-label>].
 *
 * The English label is intentionally used in the marker even when the UI shows
 * the zh label, because the resulting string is sent to Claude (stronger prompts
 * in English). Chinese label is display-only.
 */
export function applyPreset(current: string, preset: IntentPreset): string {
  if (current.includes(preset.body)) return current; // dedup
  if (current.trim().length === 0) return preset.body;
  return `${current}\n\n[Preset: ${preset.labels.en}]\n${preset.body}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lumespec/web test -- intentPresets.test.ts`
Expected: PASS — 2 tests in `INTENT_PRESETS` describe (5 presets + body-is-English heuristic), 8 tests in `applyPreset` describe (fill-empty, fill-whitespace, append-with-marker, English-marker-only, no-mutation, dedup-same-chip, dedup-after-append, allow-different-preset).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/intentPresets.ts apps/web/tests/lib/intentPresets.test.ts
git commit -m "feat(web): intent preset data + applyPreset fill/append helper"
```

---

## Task 2: `locale.ts` — navigator.language → `'en' | 'zh'`

**Why:** needed by `IntentPresets` to pick which label to render.

**Files:**
- Create: `apps/web/src/lib/locale.ts`
- Test: `apps/web/tests/lib/locale.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/lib/locale.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { detectLocale } from '../../src/lib/locale';

describe('detectLocale', () => {
  it('returns "zh" for any zh-* language tag', () => {
    expect(detectLocale('zh-TW')).toBe('zh');
    expect(detectLocale('zh-CN')).toBe('zh');
    expect(detectLocale('zh-Hant')).toBe('zh');
    expect(detectLocale('zh')).toBe('zh');
  });

  it('returns "en" for English tags', () => {
    expect(detectLocale('en-US')).toBe('en');
    expect(detectLocale('en')).toBe('en');
    expect(detectLocale('en-GB')).toBe('en');
  });

  it('returns "en" for any other language tag (conservative fallback)', () => {
    expect(detectLocale('fr-FR')).toBe('en');
    expect(detectLocale('ja-JP')).toBe('en');
    expect(detectLocale('de')).toBe('en');
  });

  it('returns "en" for empty / undefined / garbage input', () => {
    expect(detectLocale('')).toBe('en');
    expect(detectLocale(undefined)).toBe('en');
    expect(detectLocale('x-invalid-tag')).toBe('en');
  });

  it('is case-insensitive on the language subtag', () => {
    expect(detectLocale('ZH-tw')).toBe('zh');
    expect(detectLocale('EN-us')).toBe('en');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lumespec/web test -- locale.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/locale.ts`:

```ts
export type SupportedLocale = 'en' | 'zh';

/**
 * Decide which set of chip labels to render. Only two supported locales.
 * BCP-47 tags like "zh-TW" / "zh-Hans-CN" / "zh" all resolve to "zh";
 * everything else (including parse failures) falls back to "en".
 */
export function detectLocale(languageTag: string | undefined | null): SupportedLocale {
  if (!languageTag) return 'en';
  const primary = languageTag.split('-')[0]?.toLowerCase();
  if (primary === 'zh') return 'zh';
  return 'en';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lumespec/web test -- locale.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/locale.ts apps/web/tests/lib/locale.test.ts
git commit -m "feat(web): detectLocale helper for bilingual preset labels"
```

---

## Task 3: `telemetry.ts` — fire-and-forget click tracker

**Why:** the product spec says we'll prune unused presets via telemetry. Instrument on day one; the collecting endpoint can come later. No backend change required now — `sendBeacon` silently swallows 404s.

**Files:**
- Create: `apps/web/src/lib/telemetry.ts`
- Test: `apps/web/tests/lib/telemetry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/lib/telemetry.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { trackIntentPresetSelected } from '../../src/lib/telemetry';

describe('trackIntentPresetSelected', () => {
  const beaconSpy = vi.fn();
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    beaconSpy.mockReset();
    // jsdom's navigator doesn't have sendBeacon — inject a spy we control.
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { ...originalNavigator, sendBeacon: beaconSpy },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  it('calls navigator.sendBeacon with the preset id as JSON payload', () => {
    trackIntentPresetSelected('executive-summary');
    expect(beaconSpy).toHaveBeenCalledTimes(1);
    const [url, payload] = beaconSpy.mock.calls[0]!;
    expect(url).toBe('/api/telemetry/intent-preset');
    // Blob payloads are opaque in jsdom; accept Blob or string
    expect(payload).toBeTruthy();
  });

  it('does not throw when sendBeacon is unavailable (SSR / old browser)', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'test' }, // no sendBeacon
    });
    expect(() => trackIntentPresetSelected('tutorial')).not.toThrow();
  });

  it('does not throw when navigator itself is undefined', () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: undefined,
    });
    expect(() => trackIntentPresetSelected('tutorial')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lumespec/web test -- telemetry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/telemetry.ts`:

```ts
/**
 * Fire-and-forget preset-chip click tracker.
 *
 * Posts `{ presetId, ts }` to /api/telemetry/intent-preset via sendBeacon so
 * the request survives navigation. The endpoint does not exist in v2.0 — the
 * POST 404s, sendBeacon swallows it, the user sees nothing. Wire a real
 * receiver when the analytics service lands (see followup doc).
 *
 * Guarded against SSR + non-browser environments so it's safe to call from
 * any client-component event handler.
 */
export function trackIntentPresetSelected(presetId: string): void {
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') {
    return;
  }
  try {
    const payload = JSON.stringify({ presetId, ts: Date.now() });
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon('/api/telemetry/intent-preset', blob);
  } catch {
    // Swallow — telemetry must never crash a click handler.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lumespec/web test -- telemetry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/telemetry.ts apps/web/tests/lib/telemetry.test.ts
git commit -m "feat(web): intent preset telemetry via sendBeacon (endpoint deferred)"
```

---

## Task 4: `IntentPresets.tsx` — chip row component

**Files:**
- Create: `apps/web/src/components/IntentPresets.tsx`
- Test: `apps/web/tests/components/IntentPresets.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/components/IntentPresets.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { IntentPresets } from '../../src/components/IntentPresets';
import { INTENT_PRESETS } from '../../src/lib/intentPresets';

const onSelect = vi.fn();

beforeEach(() => {
  onSelect.mockReset();
});

describe('IntentPresets', () => {
  it('renders one button per preset', () => {
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    expect(screen.getAllByRole('button')).toHaveLength(INTENT_PRESETS.length);
  });

  it('renders English labels when locale="en"', () => {
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /executive summary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tutorial/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marketing hype/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /technical deep-dive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /customer success/i })).toBeInTheDocument();
  });

  it('renders Chinese labels when locale="zh"', () => {
    render(<IntentPresets locale="zh" onSelect={onSelect} />);
    expect(screen.getByRole('button', { name: /高階主管摘要/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /教學版/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /行銷版/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /技術向/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /客戶案例/ })).toBeInTheDocument();
  });

  it('sets each chip title attribute to the preset body (hover tooltip)', () => {
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    const execChip = screen.getByRole('button', { name: /executive summary/i });
    const exec = INTENT_PRESETS.find((p) => p.id === 'executive-summary')!;
    expect(execChip).toHaveAttribute('title', exec.body);
  });

  it('calls onSelect with the full preset object when a chip is clicked', async () => {
    const user = userEvent.setup();
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /tutorial/i }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      INTENT_PRESETS.find((p) => p.id === 'tutorial')
    );
  });

  it('chip buttons have type="button" so they do not submit parent forms', () => {
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    for (const btn of screen.getAllByRole('button')) {
      expect(btn).toHaveAttribute('type', 'button');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @lumespec/web test -- IntentPresets.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `apps/web/src/components/IntentPresets.tsx`:

```tsx
'use client';

import { INTENT_PRESETS, type IntentPreset } from '../lib/intentPresets';
import type { SupportedLocale } from '../lib/locale';

export interface IntentPresetsProps {
  locale: SupportedLocale;
  onSelect: (preset: IntentPreset) => void;
}

export function IntentPresets({ locale, onSelect }: IntentPresetsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Intent presets">
      {INTENT_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          title={preset.body}
          onClick={() => onSelect(preset)}
          className="text-xs rounded-full border border-brand-500 bg-white text-brand-700 px-3 py-1 hover:bg-brand-500 hover:text-white transition-colors"
        >
          {preset.labels[locale]}
        </button>
      ))}
    </div>
  );
}
```

Design notes baked into the styles:
- `type="button"` stops the chip from submitting the surrounding `<form>`.
- `title` attribute gives a native browser tooltip on hover — zero JS, no positioning logic needed. If the design team later wants a custom tooltip, swap in a Radix tooltip without changing the API.
- `hover:bg-brand-500 hover:text-white` mirrors the existing submit-button color for visual cohesion.
- `role="group" + aria-label` makes the chip row discoverable by screen readers.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @lumespec/web test -- IntentPresets.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/IntentPresets.tsx apps/web/tests/components/IntentPresets.test.tsx
git commit -m "feat(web): IntentPresets chip-row component (bilingual, accessible)"
```

---

## Task 5: Wire chip row into `JobForm.tsx`

**Files:**
- Modify: `apps/web/src/components/JobForm.tsx`
- Modify: `apps/web/tests/components/JobForm.test.tsx` (extend with chip-integration tests)

- [ ] **Step 1: Write the failing integration tests first**

Append to `apps/web/tests/components/JobForm.test.tsx` — inside the existing `describe('JobForm', ...)` block, before its closing `});`:

```tsx
  it('renders the 5 intent-preset chips below the intent textarea', () => {
    render(<JobForm onSubmit={onSubmit} />);
    // English labels are the jsdom default (navigator.language === 'en-US').
    expect(screen.getByRole('button', { name: /executive summary/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tutorial/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /marketing hype/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /technical deep-dive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /customer success/i })).toBeInTheDocument();
  });

  it('clicking a preset chip fills an empty intent textarea with the preset body', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    const intent = screen.getByLabelText(/intent/i) as HTMLTextAreaElement;
    expect(intent.value).toBe('');

    await user.click(screen.getByRole('button', { name: /executive summary/i }));
    expect(intent.value).toMatch(/emphasize business outcomes/i);
    expect(intent.value).not.toContain('[Preset:'); // fill mode, not append mode
  });

  it('clicking a preset chip appends to non-empty intent with a [Preset: ...] marker', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    const intent = screen.getByLabelText(/intent/i) as HTMLTextAreaElement;
    await user.type(intent, 'existing user intent');

    await user.click(screen.getByRole('button', { name: /tutorial/i }));
    expect(intent.value).toContain('existing user intent');
    expect(intent.value).toContain('[Preset: Tutorial / Walkthrough]');
    expect(intent.value).toMatch(/walk through the product step-by-step/i);
  });

  it('preset chips do not submit the form', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /marketing hype/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submitting after a preset click sends the merged intent to onSubmit', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/url/i), 'https://example.com');
    await user.click(screen.getByRole('button', { name: /executive summary/i }));
    await user.click(screen.getByRole('button', { name: /create/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const call = onSubmit.mock.calls[0]![0];
    expect(call.intent).toMatch(/emphasize business outcomes/i);
    expect(call.url).toBe('https://example.com');
  });
```

Run: `pnpm --filter @lumespec/web test -- JobForm.test.tsx`
Expected: FAIL — the 5 new tests can't find the chip buttons because `JobForm` doesn't render them yet.

- [ ] **Step 2: Update `JobForm.tsx`**

Replace the full contents of `apps/web/src/components/JobForm.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { JobInputSchema, type JobInput } from '../lib/types';
import { IntentPresets } from './IntentPresets';
import { applyPreset, type IntentPreset } from '../lib/intentPresets';
import { detectLocale, type SupportedLocale } from '../lib/locale';
import { trackIntentPresetSelected } from '../lib/telemetry';

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

  // Read the browser locale in the useState initializer so the very first
  // client render uses the correct language — avoids the "Flash of English"
  // for zh users. The server render always sees `undefined` and resolves to
  // 'en', so there is an expected hydration mismatch on the chip-row subtree
  // for zh users; suppressHydrationWarning on the wrapping div tells React
  // not to complain. This is the standard pragmatic pattern for locale-
  // dependent client-only UI in Next.js App Router.
  const [locale] = useState<SupportedLocale>(() =>
    detectLocale(typeof navigator !== 'undefined' ? navigator.language : undefined)
  );

  function handlePresetSelect(preset: IntentPreset) {
    setIntent((current) => applyPreset(current, preset));
    trackIntentPresetSelected(preset.id);
  }

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
        <div className="mt-2" suppressHydrationWarning>
          <IntentPresets locale={locale} onSelect={handlePresetSelect} />
        </div>
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

Key changes from the prior version:
- Locale is read from `navigator.language` directly inside `useState`'s lazy initializer so the first client paint already has the correct language. Server render resolves to `'en'` (no `navigator`), client hydration may resolve to `'zh'` — the two legitimately differ for zh users. `suppressHydrationWarning` on the wrapping `<div>` tells React to accept that divergence on the chip subtree instead of logging a warning or fighting the client value. This eliminates the "Flash of English" that a `useEffect`-based refinement would create.
- New `handlePresetSelect` using the functional setState (`setIntent((current) => ...)`) so two rapid clicks in the same tick compose correctly.
- `<IntentPresets>` rendered in a `div.mt-2` immediately below the textarea, inside the same wrapping `<div>` as the textarea so the label-to-chip-row vertical relationship is visually clear.

- [ ] **Step 3: Run full web test suite**

Run: `pnpm --filter @lumespec/web test`
Expected: PASS. The 5 new JobForm tests pass. The 4 pre-existing JobForm tests still pass (renders fields, submits correctly, validation error, disables while pending). No other web test is affected.

Run: `pnpm --filter @lumespec/web typecheck`
Expected: CLEAN.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/JobForm.tsx apps/web/tests/components/JobForm.test.tsx
git commit -m "feat(web): wire intent preset chips into JobForm"
```

---

## Task 6: Manual browser smoke + tag

**Why:** Vitest uses jsdom, which doesn't render CSS or trigger real hover events. A one-minute browser pass catches visual regressions the test suite cannot.

**Files:** none (verification only).

- [ ] **Step 1: Start the web service**

(`pnpm lume start` has its own Windows tooling issues per the followup doc — for Feature 2 verification just run the web service directly.)

```bash
pnpm --filter @lumespec/web dev
```

Open `http://localhost:3001` in a browser.

- [ ] **Step 2: Run the checklist**

Mark each as verified on your dev box. Do not proceed to step 3 until all pass.

- [ ] Chip row appears below the intent textarea — 5 pills in a horizontal row (wrap on narrow screens).
- [ ] English labels visible by default: Executive Summary, Tutorial / Walkthrough, Marketing Hype, Technical Deep-Dive, Customer Success Story.
- [ ] Chinese labels visible when browser language is zh-TW / zh-CN (`navigator.language = 'zh-TW'` via DevTools → Sensors → Locale, or change Chrome language to 繁體中文).
- [ ] Hovering a chip shows the full preset body as a native browser tooltip within ~1 second.
- [ ] Click an empty textarea + any chip → textarea fills with the preset body (no `[Preset:` marker).
- [ ] Click a chip when textarea already has text → preset appended on a blank line with `[Preset: English Label]` marker.
- [ ] Click a chip → no form submission (page doesn't reload, no job created).
- [ ] Submit after applying a preset → request succeeds; check `apps/api` log for the merged intent string reaching `POST /api/jobs`.
- [ ] DevTools Network → `sendBeacon` call to `/api/telemetry/intent-preset` fires on each click (404 response is expected until the endpoint ships — the POST must not throw).

- [ ] **Step 3: Tag the release**

```bash
git tag v2.0.0-feature2-intent-presets
git log --oneline -1
```

Do NOT push the tag. The user pushes when ready.

---

## Self-Review Against Spec

Cross-check against `docs/superpowers/specs/2026-04-24-lumespec-v2-design.md` Part 1 Feature 2 + Review Gate answer ("Keep all 5 presets; prune later via telemetry").

| Spec requirement | Covered by |
|---|---|
| 5 preset chips below the intent textarea | Task 4 + Task 5 |
| Executive Summary / Tutorial / Marketing Hype / Technical Deep-Dive / Customer Success | Task 1 `INTENT_PRESETS` data (exact 5 presets in exact order) |
| Click empty textarea + chip → fill | Task 1 `applyPreset` empty branch; Task 5 integration test |
| Click non-empty textarea + chip → append `\n\n[Preset: <name>]\n<body>` | Task 1 `applyPreset` append branch; Task 5 integration test |
| Hover shows full preset text | Task 4 `title` attribute + test |
| Chip click completes in <50ms (no network) | `applyPreset` is pure sync; `sendBeacon` is fire-and-forget and does not block the click handler |
| Double-clicking same chip does not duplicate preset text | Task 1 `applyPreset` dedup via `current.includes(preset.body)` + 3 dedup/allow tests |
| Preset text appears verbatim in submitted `input.intent` | Task 5 "submitting after preset click" integration test |
| Chip labels detect `navigator.language` for en vs zh | Task 2 `detectLocale` + Task 5 `useState` lazy init (first-paint correct, no Flash-of-English) |
| No hydration warning / visual flicker for zh users | `suppressHydrationWarning` on chip-row wrapper div in Task 5 |
| Underlying preset body always English | Task 1 test guards against CJK in body; `applyPreset` marker uses `labels.en` regardless of locale |
| Storyboard system prompt not touched | Excluded from File Structure; no task modifies `workers/storyboard/src/prompts/` |
| Telemetry for chip click-through rate (prune later) | Task 3 `trackIntentPresetSelected` + Task 5 call site in `handlePresetSelect` |

Placeholder scan: no TBD / TODO / "similar to Task N" / "handle edge cases" strings in the plan.

Type consistency: `IntentPreset` defined in Task 1, consumed unchanged in Tasks 4 + 5. `SupportedLocale` defined in Task 2, consumed in Tasks 4 + 5. `INTENT_PRESETS` constant name stable across all tasks.

Scope: pure client-side + one telemetry endpoint stub. No backend, schema, or worker changes. Storyboard prompt explicitly untouched. Each task ends with a commit; a breakage is at most one task-worth of rollback.
