# Intent Presets — Language Toggle (Option C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the intent preset chip row (shipped in v2.0.0-feature2-intent-presets) from "labels-only bilingual" to **full bilingual** — textarea body text, tooltips, and the `[Preset: ...]` marker all follow the user's chosen language. User decides the tradeoff: Chinese UI → Chinese intent text sent to Claude (acknowledged potential quality risk; WYSIWYG wins).

**Architecture:** `IntentPreset.body` changes from `string` (always English) to `{ en: string; zh: string }`. `applyPreset(current, preset, locale)` gains a `locale` param and picks the matching body + matching label for the append marker. Dedup checks BOTH bodies so toggling language + re-clicking the same chip stays idempotent. `JobForm` swaps its auto-detect-only `[locale]` state for a user-controllable `[locale, setLocale]` with an explicit EN / 中 toggle.

**Tech Stack:** Next.js 14 App Router · React 18 (client component) · Tailwind 3 · Vitest · `@testing-library/react` · `@testing-library/user-event` · no new deps.

**Predecessor commit:** `a46588c` (pushed as `v2.0.0-feature2-intent-presets`). That shipped the chip row with English-only body + English-only append marker, matching Option A of the v2.0 spec. This plan migrates to Option C per user decision on 2026-04-24.

---

## File Structure

### Modified (no new files)
- `apps/web/src/lib/intentPresets.ts` — `IntentPreset.body` shape change + 5 Chinese body authoring + `applyPreset` signature gains `locale` param + bilingual dedup.
- `apps/web/tests/lib/intentPresets.test.ts` — add locale axis to every behavior test.
- `apps/web/src/components/IntentPresets.tsx` — tooltip follows `locale`.
- `apps/web/tests/components/IntentPresets.test.tsx` — add `title` attr + locale assertion.
- `apps/web/src/components/JobForm.tsx` — `useState` tuple for mutable locale, toggle button, pass locale to `applyPreset`, pass locale to `IntentPresets`.
- `apps/web/tests/components/JobForm.test.tsx` — locale-toggle integration tests.

### Untouched (by contract)
- `workers/storyboard/src/prompts/systemPrompt.ts` — still pure English, still no mention of presets. Chinese intents flow through as user-authored text.
- Everything else.

---

## Chinese Body Drafts (for Task 1)

These are the 道地中文 rewrites I'll lock into code. They are NOT direct translations of the English bodies — each is rewritten to feel native to a Chinese-speaking product/marketing context.

| ID | 中文 body (authored, not translated) |
|---|---|
| `executive-summary` | `以商業成果、時間效益、投資報酬為主軸。節奏沉穩，不趕。結尾聚焦在最核心的一個價值主張。語氣：專業、篤定。` |
| `tutorial` | `以新手第一次使用的角度，一步步帶過產品流程。先展示起始畫面，再做出關鍵操作，最後呈現結果。關鍵步驟附上介面截圖輔助說明。語氣：清楚、耐心、循序漸進。` |
| `marketing-hype` | `高能量的行銷短片。每個鏡頭節奏快而俐落。強調速度、效果、視覺質感。主軸放在一句有力的標語。語氣：活力、現代、有衝擊力。` |
| `technical-deep-dive` | `對工程師觀眾說話。聚焦架構設計、整合方式、工程決策。點出資料流動與效能特徵。語氣：精確、有料、對專業抱持尊重。` |
| `customer-success` | `以使用者旅程的方式呈現：遇到什麼問題、原本的狀態、導入這個工具、改變後可量化的成果。用客戶見證式的節奏鋪陳。語氣：敘事、有同理心、聚焦成果。` |

(User can edit these at Task 1 review time if the tone is off.)

---

## Task 1: Schema change — `body` → `{ en, zh }` + bilingual dedup in `applyPreset`

**Why first:** everything downstream depends on the shape change. Existing v2.0.0-feature2 code reads `preset.body` as a string and will break — we need to migrate that in one coordinated commit.

**Files:**
- Modify: `apps/web/src/lib/intentPresets.ts`
- Modify: `apps/web/tests/lib/intentPresets.test.ts`

- [ ] **Step 1: Write the failing tests first**

Replace `apps/web/tests/lib/intentPresets.test.ts` with the following (the existing 10 tests are rewritten to cover the new bilingual axis):

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

  it('every preset has non-empty en + zh labels AND non-empty en + zh bodies', () => {
    for (const p of INTENT_PRESETS) {
      expect(p.labels.en.length).toBeGreaterThan(0);
      expect(p.labels.zh.length).toBeGreaterThan(0);
      expect(p.body.en.length).toBeGreaterThan(40);
      expect(p.body.zh.length).toBeGreaterThan(10); // CJK chars pack more meaning per char
      // EN body is authored in English — first 40 chars contain no CJK.
      expect(p.body.en.slice(0, 40)).not.toMatch(/[一-鿿]/);
      // ZH body is authored in Chinese — contains at least some CJK chars.
      expect(p.body.zh).toMatch(/[一-鿿]/);
    }
  });
});

describe('applyPreset', () => {
  const preset = {
    id: 'executive-summary',
    labels: { en: 'Executive Summary', zh: '高階主管摘要' },
    body: {
      en: 'Emphasize business outcomes.',
      zh: '聚焦商業成果。',
    },
  };

  it('fills an empty textarea with the EN body when locale="en"', () => {
    expect(applyPreset('', preset, 'en')).toBe('Emphasize business outcomes.');
  });

  it('fills an empty textarea with the ZH body when locale="zh"', () => {
    expect(applyPreset('', preset, 'zh')).toBe('聚焦商業成果。');
  });

  it('fills whitespace-only textarea the same way as empty', () => {
    expect(applyPreset('   \n  ', preset, 'en')).toBe('Emphasize business outcomes.');
    expect(applyPreset('   \n  ', preset, 'zh')).toBe('聚焦商業成果。');
  });

  it('appends EN body with EN label marker when locale="en" and current is non-empty', () => {
    expect(applyPreset('existing', preset, 'en')).toBe(
      'existing\n\n[Preset: Executive Summary]\nEmphasize business outcomes.'
    );
  });

  it('appends ZH body with ZH label marker when locale="zh" and current is non-empty', () => {
    expect(applyPreset('既有內容', preset, 'zh')).toBe(
      '既有內容\n\n[Preset: 高階主管摘要]\n聚焦商業成果。'
    );
  });

  it('dedup: same locale + same chip twice = no duplicate', () => {
    const once = applyPreset('', preset, 'en');
    const twice = applyPreset(once, preset, 'en');
    expect(twice).toBe(once);
  });

  it('dedup is bilingual: EN body applied, then zh click of same preset = no-op', () => {
    // User applied the preset in English, then toggled UI to zh and re-clicked.
    // The EN body is already there semantically — don't append a zh copy on top.
    const withEn = applyPreset('', preset, 'en');
    const afterZhReclick = applyPreset(withEn, preset, 'zh');
    expect(afterZhReclick).toBe(withEn);
  });

  it('dedup is bilingual: ZH body applied, then en click of same preset = no-op', () => {
    const withZh = applyPreset('', preset, 'zh');
    const afterEnReclick = applyPreset(withZh, preset, 'en');
    expect(afterEnReclick).toBe(withZh);
  });

  it('allows appending a DIFFERENT preset even if the first was in a different locale', () => {
    const tutorial = {
      id: 'tutorial',
      labels: { en: 'Tutorial', zh: '教學版' },
      body: { en: 'Walk through.', zh: '一步步帶過。' },
    };
    // First: EN exec summary. Then: zh tutorial append.
    const first = applyPreset('', preset, 'en');
    const second = applyPreset(first, tutorial, 'zh');
    expect(second).toContain(preset.body.en);
    expect(second).toContain('[Preset: 教學版]');
    expect(second).toContain(tutorial.body.zh);
  });

  it('does not mutate the preset object', () => {
    const snapshot = JSON.stringify(preset);
    applyPreset('anything', preset, 'en');
    applyPreset('anything', preset, 'zh');
    expect(JSON.stringify(preset)).toBe(snapshot);
  });
});
```

Run: `pnpm --filter @lumespec/web test -- intentPresets.test.ts`
Expected: FAIL — multiple tests fail because the current `applyPreset` signature is `(current, preset)` (no locale) and `preset.body` is a string.

- [ ] **Step 2: Update the schema + implementation**

Replace `apps/web/src/lib/intentPresets.ts` with:

```ts
import type { SupportedLocale } from './locale';

export interface IntentPreset {
  /** Stable identifier for telemetry. Never change once shipped. */
  id: string;
  labels: { en: string; zh: string };
  /** Bilingual body. UI renders the locale-matching body in the tooltip and
   *  splices the locale-matching body into the textarea on click. Whatever
   *  locale the user picks at submit time is what Claude receives.
   *
   *  Note: the EN body is stronger for Claude's scene generation — the
   *  storyboard worker's system prompt is authored in English and Claude
   *  prompts more reliably in English. Users who pick zh accept that
   *  tradeoff (per v2.0 product decision, Option C). */
  body: { en: string; zh: string };
}

export const INTENT_PRESETS: IntentPreset[] = [
  {
    id: 'executive-summary',
    labels: { en: 'Executive Summary', zh: '高階主管摘要' },
    body: {
      en: [
        'Emphasize business outcomes, time savings, and ROI.',
        'Keep pacing deliberate. Close on the single strongest value proposition.',
        'Tone: authoritative, calm.',
      ].join(' '),
      zh: '以商業成果、時間效益、投資報酬為主軸。節奏沉穩,不趕。結尾聚焦在最核心的一個價值主張。語氣:專業、篤定。',
    },
  },
  {
    id: 'tutorial',
    labels: { en: 'Tutorial / Walkthrough', zh: '教學版' },
    body: {
      en: [
        'Walk through the product step-by-step as a first-time user would experience it.',
        'Show the starting state, the key action, then the result.',
        'Include screenshots of the UI where helpful.',
        'Tone: instructive, clear, patient.',
      ].join(' '),
      zh: '以新手第一次使用的角度,一步步帶過產品流程。先展示起始畫面,再做出關鍵操作,最後呈現結果。關鍵步驟附上介面截圖輔助說明。語氣:清楚、耐心、循序漸進。',
    },
  },
  {
    id: 'marketing-hype',
    labels: { en: 'Marketing Hype', zh: '行銷版' },
    body: {
      en: [
        'High-energy promotional spot.',
        'Short punchy scene durations. Emphasize speed, results, and aesthetic.',
        'Use a single powerful tagline.',
        'Tone: energetic, modern.',
      ].join(' '),
      zh: '高能量的行銷短片。每個鏡頭節奏快而俐落。強調速度、效果、視覺質感。主軸放在一句有力的標語。語氣:活力、現代、有衝擊力。',
    },
  },
  {
    id: 'technical-deep-dive',
    labels: { en: 'Technical Deep-Dive', zh: '技術向' },
    body: {
      en: [
        'Speak to a developer audience.',
        'Emphasize architecture, integrations, and engineering decisions.',
        'Highlight data flows and performance characteristics.',
        'Tone: precise, substantive, respectful of expertise.',
      ].join(' '),
      zh: '對工程師觀眾說話。聚焦架構設計、整合方式、工程決策。點出資料流動與效能特徵。語氣:精確、有料、對專業抱持尊重。',
    },
  },
  {
    id: 'customer-success',
    labels: { en: 'Customer Success Story', zh: '客戶案例' },
    body: {
      en: [
        'Frame as a user journey: the problem, the before state, adopting the tool,',
        'then the after state with measurable results.',
        'Use testimonial-style beats.',
        'Tone: narrative, empathetic, outcome-focused.',
      ].join(' '),
      zh: '以使用者旅程的方式呈現:遇到什麼問題、原本的狀態、導入這個工具、改變後可量化的成果。用客戶見證式的節奏鋪陳。語氣:敘事、有同理心、聚焦成果。',
    },
  },
];

/**
 * Pure fill/append rule used when a chip is clicked.
 *
 * Precedence (in order):
 *   1. Bilingual dedup — if EITHER `body.en` OR `body.zh` already appears
 *      verbatim in `current`, return unchanged. Prevents a double-click OR a
 *      locale-swap + re-click from stuffing two copies of the same preset
 *      into the textarea.
 *   2. Empty / whitespace-only current → return the locale-matching body
 *      verbatim (fill mode).
 *   3. Otherwise → append on a blank line, prefixed with [Preset: <label>]
 *      where the label AND body both follow the passed `locale`.
 *
 * The marker language matches the body language — if the user is working in
 * zh, the whole block reads consistently in zh (WYSIWYG). This is the Option C
 * behavior; earlier versions forced English-only marker for Claude quality.
 */
export function applyPreset(
  current: string,
  preset: IntentPreset,
  locale: SupportedLocale
): string {
  if (current.includes(preset.body.en) || current.includes(preset.body.zh)) {
    return current; // dedup, bilingual
  }
  if (current.trim().length === 0) return preset.body[locale];
  return `${current}\n\n[Preset: ${preset.labels[locale]}]\n${preset.body[locale]}`;
}
```

Key changes from the v2.0.0-feature2 version:
- `body: { en, zh }` structure (was `string`).
- `applyPreset(current, preset, locale)` gains `locale` parameter.
- Dedup checks BOTH `body.en` and `body.zh` (bilingual dedup).
- Marker uses `preset.labels[locale]` (was hardcoded `labels.en`).
- `SupportedLocale` imported from `./locale` (Task 2 file from the earlier plan, still exists).

- [ ] **Step 3: Run test to verify it passes**

Run: `pnpm --filter @lumespec/web test -- intentPresets.test.ts`
Expected: PASS — 2 tests in `INTENT_PRESETS` describe + 10 tests in `applyPreset` describe.

Run the full web test suite:
```
pnpm --filter @lumespec/web test
```
Expected: MOST tests pass but the IntentPresets + JobForm component tests FAIL because they're still passing `applyPreset(current, preset)` with the old 2-arg signature, and they still read `preset.body` as a string in tooltips. Those are Tasks 3-5. FAIL is expected here; move on.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/intentPresets.ts apps/web/tests/lib/intentPresets.test.ts
git commit -m "feat(web): bilingual IntentPreset body + locale param for applyPreset

Option C per v2.0 spec Review Gate: UI locale → textarea body → Claude intent all match. Chinese bodies authored natively (not translated). Dedup now bilingual so toggling + re-clicking same chip is idempotent."
```

---

## Task 2: `IntentPresets.tsx` tooltip + (no structural change beyond `title` attr)

**Files:**
- Modify: `apps/web/src/components/IntentPresets.tsx`
- Modify: `apps/web/tests/components/IntentPresets.test.tsx`

- [ ] **Step 1: Update the component test**

Edit `apps/web/tests/components/IntentPresets.test.tsx` — update the existing "tooltip" test and add a locale-axis test:

Find:
```tsx
  it('sets each chip title attribute to the preset body (hover tooltip)', () => {
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    const execChip = screen.getByRole('button', { name: /executive summary/i });
    const exec = INTENT_PRESETS.find((p) => p.id === 'executive-summary')!;
    expect(execChip).toHaveAttribute('title', exec.body);
  });
```

Replace with:
```tsx
  it('sets each chip title attribute to the EN preset body when locale="en"', () => {
    render(<IntentPresets locale="en" onSelect={onSelect} />);
    const execChip = screen.getByRole('button', { name: /executive summary/i });
    const exec = INTENT_PRESETS.find((p) => p.id === 'executive-summary')!;
    expect(execChip).toHaveAttribute('title', exec.body.en);
  });

  it('sets each chip title attribute to the ZH preset body when locale="zh"', () => {
    render(<IntentPresets locale="zh" onSelect={onSelect} />);
    const execChip = screen.getByRole('button', { name: /高階主管摘要/ });
    const exec = INTENT_PRESETS.find((p) => p.id === 'executive-summary')!;
    expect(execChip).toHaveAttribute('title', exec.body.zh);
  });
```

Run: `pnpm --filter @lumespec/web test -- IntentPresets.test.tsx`
Expected: FAIL — `title={preset.body}` in the component currently stringifies `{en, zh}` to `"[object Object]"`.

- [ ] **Step 2: Update the component**

Edit `apps/web/src/components/IntentPresets.tsx` — change the `title` prop:

Find:
```tsx
          title={preset.body}
```

Replace with:
```tsx
          title={preset.body[locale]}
```

That's the only change. The component already takes `locale` as a prop; we just wire it into the tooltip too.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @lumespec/web test -- IntentPresets.test.tsx`
Expected: PASS (7 tests — original 6 minus the old tooltip test, plus 2 new tooltip-per-locale tests).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/IntentPresets.tsx apps/web/tests/components/IntentPresets.test.tsx
git commit -m "feat(web): IntentPresets tooltip follows locale"
```

---

## Task 3: `JobForm` explicit locale toggle button

**Files:**
- Modify: `apps/web/src/components/JobForm.tsx`
- Modify: `apps/web/tests/components/JobForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to `apps/web/tests/components/JobForm.test.tsx` inside the `describe('JobForm', ...)` block, before its closing `});`:

```tsx
  it('renders a language toggle button and switches chip labels + tooltips', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);

    // jsdom default navigator.language is 'en-US' → initial locale is 'en'.
    expect(screen.getByRole('button', { name: /executive summary/i })).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /中/ });
    await user.click(toggle);

    // After toggle: chip labels flip to zh.
    expect(screen.getByRole('button', { name: /高階主管摘要/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /executive summary/i })).not.toBeInTheDocument();

    // Tooltip also flipped.
    const chip = screen.getByRole('button', { name: /高階主管摘要/ });
    expect(chip.getAttribute('title')).toMatch(/[一-鿿]/); // CJK char present
  });

  it('clicking a chip after toggling to zh fills textarea with ZH body', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /中/ }));
    const intent = screen.getByLabelText(/intent/i) as HTMLTextAreaElement;
    expect(intent.value).toBe('');

    await user.click(screen.getByRole('button', { name: /高階主管摘要/ }));
    expect(intent.value).toMatch(/[一-鿿]/); // CJK body was spliced in
    expect(intent.value).not.toContain('Emphasize business outcomes'); // NOT the en body
    expect(intent.value).not.toContain('[Preset:'); // fill mode, not append
  });

  it('append mode in zh uses the zh label in the [Preset: ...] marker', async () => {
    const user = userEvent.setup();
    render(<JobForm onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /中/ }));
    const intent = screen.getByLabelText(/intent/i) as HTMLTextAreaElement;
    await user.type(intent, '既有文字');
    await user.click(screen.getByRole('button', { name: /教學版/ }));

    expect(intent.value).toContain('既有文字');
    expect(intent.value).toContain('[Preset: 教學版]');
    expect(intent.value).not.toContain('[Preset: Tutorial'); // no en marker in zh mode
  });
```

Run: `pnpm --filter @lumespec/web test -- JobForm.test.tsx`
Expected: FAIL — no toggle button exists yet; query by `/中/` returns nothing.

- [ ] **Step 2: Update `JobForm.tsx`**

Open `apps/web/src/components/JobForm.tsx`. Make these changes:

Change the locale `useState` from read-only tuple to mutable:

Find:
```tsx
  const [locale] = useState<SupportedLocale>(() =>
    detectLocale(typeof navigator !== 'undefined' ? navigator.language : undefined)
  );
```

Replace with:
```tsx
  const [locale, setLocale] = useState<SupportedLocale>(() =>
    detectLocale(typeof navigator !== 'undefined' ? navigator.language : undefined)
  );
```

Update `handlePresetSelect` to pass locale:

Find:
```tsx
  function handlePresetSelect(preset: IntentPreset) {
    setIntent((current) => applyPreset(current, preset));
    trackIntentPresetSelected(preset.id);
  }
```

Replace with:
```tsx
  function handlePresetSelect(preset: IntentPreset) {
    setIntent((current) => applyPreset(current, preset, locale));
    trackIntentPresetSelected(preset.id);
  }
```

Add a toggle button inside the chip-row wrapper `<div>`. Find:
```tsx
        <div className="mt-2" suppressHydrationWarning>
          <IntentPresets locale={locale} onSelect={handlePresetSelect} />
        </div>
```

Replace with:
```tsx
        <div className="mt-2 flex items-start gap-3" suppressHydrationWarning>
          <button
            type="button"
            onClick={() => setLocale(locale === 'en' ? 'zh' : 'en')}
            className="text-xs rounded-md border border-gray-300 bg-white px-2 py-1 font-medium text-gray-700 hover:bg-gray-50 shrink-0"
            aria-label="Toggle preset language"
            title="Switch preset language"
          >
            {locale === 'en' ? '中' : 'EN'}
          </button>
          <div className="flex-1">
            <IntentPresets locale={locale} onSelect={handlePresetSelect} />
          </div>
        </div>
```

Design rationale baked into the styles:
- Button shows the OTHER language's abbreviation — when viewing English, show 中 to invite the switch. Common bilingual-toggle UX.
- `shrink-0` prevents the toggle from shrinking when chips wrap.
- Toggle is visually distinct from chips (gray border, not brand-colored).
- `aria-label` describes action, `title` gives hover clarification.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @lumespec/web test -- JobForm.test.tsx`
Expected: PASS (existing 9 tests + 3 new locale-toggle tests = 12 total for JobForm).

Run the full web suite:
```
pnpm --filter @lumespec/web test
```
Expected: ALL PASS (64 from before + new tests — expect 70+ now).

Run typecheck:
```
pnpm --filter @lumespec/web typecheck
```
Expected: CLEAN.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/JobForm.tsx apps/web/tests/components/JobForm.test.tsx
git commit -m "feat(web): explicit EN/中 locale toggle on intent preset row"
```

---

## Task 4: Manual browser smoke + tag

**Files:** none (verification only).

- [ ] **Step 1: Start web only** (don't need the full pipeline — this is pure client UI)

```bash
pnpm --filter @lumespec/web dev
```

Open `http://localhost:3001` in a browser. Leave DevTools open.

- [ ] **Step 2: Checklist**

- [ ] Chip row renders with English labels on first paint (default navigator.language is en).
- [ ] A small `中` button sits to the LEFT of the chip row.
- [ ] Click `中` → button text flips to `EN`, all 5 chip labels flip to Chinese (高階主管摘要 / 教學版 / 行銷版 / 技術向 / 客戶案例).
- [ ] Hover a chip in zh mode → tooltip shows Chinese body text after ~1 second.
- [ ] Empty textarea + click 「教學版」→ textarea fills with Chinese body (「以新手第一次使用的角度...」), NO `[Preset:` marker.
- [ ] Non-empty textarea + click 「客戶案例」→ appended with `[Preset: 客戶案例]\n以使用者旅程的方式...`.
- [ ] Toggle back to EN → labels flip English again. The textarea's Chinese content STAYS (toggle only affects future clicks, not past).
- [ ] Double-click same chip after textarea has the body → no duplicate (dedup works within a locale).
- [ ] Click chip in EN, toggle to zh, click SAME chip again → no duplicate (bilingual dedup — the EN body in textarea blocks the zh body from appending).
- [ ] Reload page with browser language set to zh-TW (DevTools → Sensors → Locale) → chips appear in Chinese immediately, toggle shows `EN`. No hydration error in console.

- [ ] **Step 3: Tag the release**

```bash
git tag v2.0.0-feature2-bilingual
git log --oneline -1
```

Do not push the tag. User pushes when ready.

---

## Self-Review Against Spec + User Decision

Cross-check against:
- `docs/superpowers/specs/2026-04-24-lumespec-v2-design.md` Part 1 Feature 2 (original English-only spec).
- User decision 2026-04-24: Option C — full bilingual, Chinese body to Claude, user accepts quality risk.

| Requirement | Addressed by |
|---|---|
| Explicit language toggle button (user-controllable, not auto-detect-only) | Task 3 `setLocale` tuple + EN/中 button |
| Chip labels follow toggle | Shipped in v2.0.0-feature2; no change needed (already wired via `locale` prop) |
| Tooltip follows toggle | Task 2 `title={preset.body[locale]}` |
| Textarea body follows toggle (Option C) | Task 1 `applyPreset(..., locale)` picks `body[locale]` |
| `[Preset: ...]` marker follows toggle | Task 1 uses `preset.labels[locale]` in the marker |
| Double-click same chip is no-op | Task 1 dedup: `current.includes(body.en) \|\| current.includes(body.zh)` |
| Locale-swap + re-click same chip is no-op | Task 1 bilingual dedup (same rule covers both cases) |
| Native Chinese bodies, not translationese | Task 1 Chinese body drafts — rewritten, not translated |
| No storyboard prompt changes | systemPrompt.ts untouched per plan File Structure |
| No backend changes | Zero apps/api, workers/*, packages/* edits |

Placeholder scan: no TBD / TODO / "handle edge cases" strings.

Type consistency: `IntentPreset.body` is `{ en, zh }` throughout Tasks 1-3. `applyPreset(current, preset, locale)` 3-arg signature consistent across Task 1 definition and Task 3 JobForm call site. `SupportedLocale` imported from the existing `./locale` module.

Scope: pure client-side migration of an already-shipped feature. No backend, no schema, no storyboard prompt. 4 tasks (reduced from 6 because 2 tasks in the original draft merged naturally — the schema change and the applyPreset signature change share the same file and same commit; the JobForm wiring and the toggle button UI are one coherent change).

## Risk Analysis

- **Claude quality on Chinese intent text:** user-accepted. Tracking: if post-launch user feedback shows storyboard quality drops materially for zh users, the fix is a silent `en` fallback at submit time (keep UI WYSIWYG but send en body to Claude). That's roughly a 10-line change if we ever need it — add `body[locale]` → `body.en` swap in JobForm's submit handler.
- **Bilingual dedup false-positives:** rare. Two different presets would need to share a body substring. The 5 bodies are distinctive enough (different verbs, topics) that substring collisions are effectively impossible.
- **SSR hydration:** unchanged from v2.0.0-feature2 — `suppressHydrationWarning` on each chip button already handles the server-en/client-zh divergence.
- **Browser language-change during session:** The `useState` initializer runs once. If the user changes OS / browser language while the tab is open, they need to reload OR use the explicit toggle. Acceptable.
