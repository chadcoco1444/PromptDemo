# Creativity Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unlock BentoGrid and CursorDemo scene types, add industry-aware Style Modifier injection into the user message, and liberate RHYTHM_TEMPLATES from prescriptive to suggestive — making every generated video structurally unique.

**Architecture:** Pure-function industry detector (`industryDetect.ts`) appends a `## Product Style Guidance` block to the user message without touching the cached system prompt. `V1_IMPLEMENTED_SCENE_TYPES` in `sceneTypeCatalog.ts` expands from 5 → 7; the Zod schemas for both new types already exist in `@lumespec/schema`. Remotion components implement the visual render.

**Tech Stack:** TypeScript, Remotion 4 (`useCurrentFrame`, `interpolate`, `spring`), Zod 3, Vitest, `@lumespec/schema`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `workers/storyboard/src/prompts/industryDetect.ts` | **create** | Heuristic industry classifier + STYLE_MODIFIERS record |
| `workers/storyboard/tests/industryDetect.test.ts` | **create** | Unit tests for pure classify function |
| `workers/storyboard/src/prompts/userMessage.ts` | **modify** | Append Style Modifier block after existing blocks |
| `workers/storyboard/tests/userMessage.test.ts` | **create** | Tests for style modifier injection |
| `workers/storyboard/src/prompts/sceneTypeCatalog.ts` | **modify** | Add 'BentoGrid' + 'CursorDemo' to `V1_IMPLEMENTED_SCENE_TYPES`; update CursorDemo compass description |
| `workers/storyboard/src/prompts/systemPrompt.ts` | **modify** | Relax RHYTHM_TEMPLATES; add CREATIVITY_DIRECTIVE constant |
| `packages/remotion/src/scenes/BentoGrid.tsx` | **create** | Remotion scene component: stagger-spring grid |
| `packages/remotion/src/scenes/CursorDemo.tsx` | **create** | Remotion scene component: Bezier cursor + 4 action animations |
| `packages/remotion/src/resolveScene.tsx` | **modify** | Replace `throw` stubs with component renders for BentoGrid + CursorDemo |
| `packages/remotion/tests/bentoGrid.test.ts` | **create** | Unit tests for grid column logic (pure function) |
| `packages/remotion/tests/cursorDemo.test.ts` | **create** | Unit tests for REGION_COORDS mapping + bezierQuad (pure functions) |

---

## Task 1: industryDetect.ts — Heuristic Classifier

**Files:**
- Create: `workers/storyboard/src/prompts/industryDetect.ts`
- Create: `workers/storyboard/tests/industryDetect.test.ts`

- [ ] **Step 1.1: Write the failing tests**

Create `workers/storyboard/tests/industryDetect.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { detectIndustry, STYLE_MODIFIERS } from '../src/prompts/industryDetect.js';
import type { CrawlResult } from '@lumespec/schema';

// Minimal fixture — extend only the fields detectIndustry actually reads
function make(overrides: {
  sourceTexts?: string[];
  features?: Array<{ title: string; description?: string }>;
}): CrawlResult {
  return {
    brand: { name: 'Acme', primaryColor: '#7c3aed' },
    screenshots: {},
    sourceTexts: overrides.sourceTexts ?? ['A product for modern teams'],
    features: (overrides.features ?? []) as CrawlResult['features'],
    tier: 'A',
    trackUsed: false,
  } as unknown as CrawlResult;
}

describe('detectIndustry', () => {
  it('detects developer_tool when sourceTexts contain "api"', () => {
    expect(detectIndustry(make({ sourceTexts: ['Powerful API for developers'] }))).toBe('developer_tool');
  });

  it('detects developer_tool when sourceTexts contain "sdk"', () => {
    expect(detectIndustry(make({ sourceTexts: ['Install via npm, SDK included'] }))).toBe('developer_tool');
  });

  it('detects developer_tool from feature description containing "webhook"', () => {
    expect(detectIndustry(make({
      features: [{ title: 'Webhooks', description: 'webhook delivery for every event' }],
    }))).toBe('developer_tool');
  });

  it('detects ecommerce when sourceTexts contain price pattern $N', () => {
    expect(detectIndustry(make({ sourceTexts: ['Only $29.99 per month'] }))).toBe('ecommerce');
  });

  it('detects ecommerce when sourceTexts contain "cart"', () => {
    expect(detectIndustry(make({ sourceTexts: ['Add to cart and save'] }))).toBe('ecommerce');
  });

  it('detects ecommerce when sourceTexts contain "checkout"', () => {
    expect(detectIndustry(make({ sourceTexts: ['Fast checkout experience'] }))).toBe('ecommerce');
  });

  it('developer_tool wins over ecommerce when both signals present', () => {
    expect(detectIndustry(make({
      sourceTexts: ['$19 per month', 'REST API available for all plans'],
    }))).toBe('developer_tool');
  });

  it('detects saas_tool when 3+ features and no other signals', () => {
    expect(detectIndustry(make({
      features: [
        { title: 'Dashboards', description: 'Real-time metrics' },
        { title: 'Integrations', description: 'Connect your tools' },
        { title: 'Reporting', description: 'Export reports' },
      ],
      sourceTexts: ['Streamline your workflow'],
    }))).toBe('saas_tool');
  });

  it('detects content_media for 0 features + long paragraphs', () => {
    const longText =
      'This is a very long article about technology innovation spanning many words and ideas ' +
      'continuing across the page with detailed analysis and thoughtful commentary throughout.';
    expect(detectIndustry(make({
      features: [],
      sourceTexts: [longText, longText],
    }))).toBe('content_media');
  });

  it('falls back to default when signals are ambiguous', () => {
    expect(detectIndustry(make({
      features: [{ title: 'One feature', description: 'Something' }],
      sourceTexts: ['Short text'],
    }))).toBe('default');
  });
});

describe('STYLE_MODIFIERS', () => {
  it('returns empty string for default', () => {
    expect(STYLE_MODIFIERS['default']).toBe('');
  });

  it('mentions CursorDemo for developer_tool', () => {
    expect(STYLE_MODIFIERS['developer_tool']).toContain('CursorDemo');
  });

  it('mentions BentoGrid for saas_tool', () => {
    expect(STYLE_MODIFIERS['saas_tool']).toContain('BentoGrid');
  });

  it('mentions SmoothScroll for ecommerce', () => {
    expect(STYLE_MODIFIERS['ecommerce']).toContain('SmoothScroll');
  });
});
```

- [ ] **Step 1.2: Run test — confirm it fails**

```bash
cd workers/storyboard
npx vitest run tests/industryDetect.test.ts
```

Expected: FAIL — `Cannot find module '../src/prompts/industryDetect.js'`

- [ ] **Step 1.3: Implement `industryDetect.ts`**

Create `workers/storyboard/src/prompts/industryDetect.ts`:

```typescript
import type { CrawlResult } from '@lumespec/schema';

export type IndustryCategory =
  | 'developer_tool'
  | 'ecommerce'
  | 'saas_tool'
  | 'content_media'
  | 'default';

const DEVELOPER_KEYWORDS = [
  'api', 'sdk', 'cli', 'npm', 'github', 'webhook',
  'endpoint', 'open source', 'repository', 'package', 'library',
];

const ECOMMERCE_KEYWORDS = [
  'cart', 'checkout', 'buy now', 'add to bag', 'add to cart',
  'free shipping', 'discount', 'coupon',
];

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

function hasPrice(texts: string[]): boolean {
  return /\$\d/.test(texts.join(' '));
}

export function detectIndustry(crawlResult: CrawlResult): IndustryCategory {
  const featureTexts = crawlResult.features
    .map((f) => `${f.title} ${(f as { description?: string }).description ?? ''}`)
    .join(' ');
  const allText = [...crawlResult.sourceTexts, featureTexts].join(' ');

  if (containsAny(allText, DEVELOPER_KEYWORDS)) return 'developer_tool';

  const sourceText = crawlResult.sourceTexts.join(' ');
  if (hasPrice(crawlResult.sourceTexts) || containsAny(sourceText, ECOMMERCE_KEYWORDS)) {
    return 'ecommerce';
  }

  if (crawlResult.features.length >= 3) return 'saas_tool';

  const avgWords =
    crawlResult.sourceTexts.length > 0
      ? crawlResult.sourceTexts.reduce((sum, t) => sum + t.split(' ').length, 0) /
        crawlResult.sourceTexts.length
      : 0;
  if (crawlResult.features.length <= 1 && avgWords > 20) return 'content_media';

  return 'default';
}

export const STYLE_MODIFIERS: Record<IndustryCategory, string> = {
  developer_tool: `Be precise and concise — no marketing fluff. The audience is technical.
Lead with what this tool DOES, not what it "empowers" you to do.
CursorDemo is highly effective here — show the real workflow, not a screenshot tour.
FeatureCallout scenes should use left-aligned layout for readability.`,

  ecommerce: `Lead with visual impact and desire. Short, punchy copy only.
Use TextPunch for price or offer callouts.
SmoothScroll on the product page creates appetite — use it.
The CTA must be action-forward (Shop Now, Get Yours, etc.), not generic.`,

  saas_tool: `Emphasize efficiency, workflow integration, and team productivity.
Lead with the core value proposition — what pain does it eliminate?
BentoGrid is ideal for showing multiple features without scene bloat.
Open with the main dashboard or interface via HeroRealShot.`,

  content_media: `Open with a strong TextPunch headline to set editorial authority.
Use SmoothScroll to convey the volume and depth of content.
Tone should be authoritative and inviting — not sales-y.
Avoid CursorDemo (no interactive UI to demonstrate).`,

  default: '',
};
```

- [ ] **Step 1.4: Run tests — confirm they pass**

```bash
cd workers/storyboard
npx vitest run tests/industryDetect.test.ts
```

Expected: all 13 tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add workers/storyboard/src/prompts/industryDetect.ts workers/storyboard/tests/industryDetect.test.ts
git commit -m "feat(storyboard): add industry heuristic classifier + style modifiers"
```

---

## Task 2: userMessage.ts — Style Modifier Injection

**Files:**
- Modify: `workers/storyboard/src/prompts/userMessage.ts`
- Create: `workers/storyboard/tests/userMessage.test.ts`

- [ ] **Step 2.1: Write failing tests**

Create `workers/storyboard/tests/userMessage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildUserMessage } from '../src/prompts/userMessage.js';
import type { CrawlResult } from '@lumespec/schema';

function makeCrawl(overrides: {
  sourceTexts?: string[];
  features?: Array<{ title: string; description?: string }>;
}): CrawlResult {
  return {
    brand: { name: 'Acme', primaryColor: '#7c3aed' },
    screenshots: { viewport: 's3://bucket/viewport.png' },
    sourceTexts: overrides.sourceTexts ?? ['Great product for teams'],
    features: (overrides.features ?? []) as CrawlResult['features'],
    tier: 'A',
    trackUsed: false,
  } as unknown as CrawlResult;
}

describe('buildUserMessage — style modifier injection', () => {
  it('appends ## Product Style Guidance block for developer_tool', () => {
    const msg = buildUserMessage({
      intent: 'show the api',
      duration: 30,
      crawlResult: makeCrawl({ sourceTexts: ['REST API with webhooks and SDK'] }),
    });
    expect(msg).toContain('## Product Style Guidance');
    expect(msg).toContain('CursorDemo');
  });

  it('appends style guidance for saas_tool (3+ features)', () => {
    const msg = buildUserMessage({
      intent: 'show features',
      duration: 30,
      crawlResult: makeCrawl({
        features: [
          { title: 'Reports', description: 'Analytics' },
          { title: 'Integrations', description: 'Connect tools' },
          { title: 'Automations', description: 'Save time' },
        ],
      }),
    });
    expect(msg).toContain('## Product Style Guidance');
    expect(msg).toContain('BentoGrid');
  });

  it('does NOT append style guidance for default (no signals)', () => {
    const msg = buildUserMessage({
      intent: 'generic video',
      duration: 10,
      crawlResult: makeCrawl({ features: [], sourceTexts: ['Nice product'] }),
    });
    expect(msg).not.toContain('## Product Style Guidance');
  });

  it('style guidance block comes after the 7 existing blocks', () => {
    const msg = buildUserMessage({
      intent: 'show api',
      duration: 30,
      crawlResult: makeCrawl({ sourceTexts: ['API-first platform with SDK'] }),
    });
    const crawlerIdx = msg.indexOf('## Crawler tier');
    const guidanceIdx = msg.indexOf('## Product Style Guidance');
    expect(guidanceIdx).toBeGreaterThan(crawlerIdx);
  });
});
```

- [ ] **Step 2.2: Run tests — confirm they fail**

```bash
cd workers/storyboard
npx vitest run tests/userMessage.test.ts
```

Expected: FAIL — `## Product Style Guidance` not found in output

- [ ] **Step 2.3: Modify `userMessage.ts`**

Add import and injection at the end of the file. The final `buildUserMessage` function becomes:

```typescript
import type { CrawlResult } from '@lumespec/schema';
import { detectIndustry, STYLE_MODIFIERS } from './industryDetect.js';

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

  const modifier = STYLE_MODIFIERS[detectIndustry(input.crawlResult)];
  if (modifier) {
    blocks.push(`## Product Style Guidance\n${modifier}`);
  }

  blocks.push(`\nReturn a valid Storyboard JSON matching the hard rules in the system prompt.`);
  return blocks.join('\n\n');
}
```

- [ ] **Step 2.4: Run tests — confirm they pass**

```bash
cd workers/storyboard
npx vitest run tests/userMessage.test.ts tests/industryDetect.test.ts
```

Expected: all tests PASS

- [ ] **Step 2.5: Commit**

```bash
git add workers/storyboard/src/prompts/userMessage.ts workers/storyboard/tests/userMessage.test.ts
git commit -m "feat(storyboard): inject industry style modifier into user message"
```

---

## Task 3: sceneTypeCatalog.ts — Unlock BentoGrid + CursorDemo

**Files:**
- Modify: `workers/storyboard/src/prompts/sceneTypeCatalog.ts`

No new tests needed — the existing test suite for the storyboard worker will exercise the updated prompt. The key change is `V1_IMPLEMENTED_SCENE_TYPES` and the CursorDemo description (to match Zod schema's actual region enum values).

- [ ] **Step 3.1: Update `sceneTypeCatalog.ts`**

Replace the file with:

```typescript
import { SCENE_TYPES } from '@lumespec/schema';

export const SCENE_CATALOG: Record<(typeof SCENE_TYPES)[number], string> = {
  HeroRealShot:
    'Opening scene with a real screenshot + overlaid title/subtitle. Props: { title, subtitle?, screenshotKey: "viewport"|"fullPage" }. Use only when assets.screenshots.viewport or fullPage exists.',
  HeroStylized:
    'Opening scene with a stylized re-draw (no screenshot). Props: { title, subtitle? }. Use when assets.screenshots is empty (Tier B fallback).',
  FeatureCallout:
    'Single feature focus. Props: { title, description, layout: "leftImage"|"rightImage"|"topDown", iconHint? }. The core building block of the middle section.',
  CursorDemo:
    'Simulated cursor interaction — shows a moving cursor performing an action on the product UI. Props: { action: "Click"|"Scroll"|"Hover"|"Type", targetHint: { region: "top-left"|"top"|"top-right"|"left"|"center"|"right"|"bottom-left"|"bottom"|"bottom-right" }, targetDescription: string }. Best for 30s/60s videos. Use to show real user workflows, not just screenshots.',
  SmoothScroll:
    'Long-page scroll showcase. Props: { screenshotKey: "fullPage", speed: "slow"|"medium"|"fast" }. Requires assets.screenshots.fullPage.',
  UseCaseStory:
    'Three-beat narrative. Props: { beats: [{label:"before",text}, {label:"action",text}, {label:"after",text}] }. Only for 60s videos.',
  StatsBand:
    'Numeric callout band. Props: { stats: [{value, label}] (1-4 items) }. Use only if sourceTexts contain numeric phrases.',
  BentoGrid:
    'Dense feature grid (3-6 items) — shows multiple features in one scene instead of separate FeatureCallouts. Props: { items: [{title, description?, iconHint?}] }. Ideal for 30s/60s videos when 3+ small features would otherwise create scene bloat.',
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
  'BentoGrid',
  'CursorDemo',
] as const;

/**
 * The exact slice of SCENE_CATALOG that's actually wired through to
 * Remotion. We hand-assemble the prompt fragment from this so the system
 * prompt cannot accidentally leak unimplemented scene types.
 *
 * This is the ONLY place the catalog is filtered for prompt purposes.
 * Anyone adding a new V1_IMPLEMENTED scene only updates the array above
 * and AVAILABLE_SCENES_PROMPT regenerates automatically.
 */
export const AVAILABLE_SCENES_PROMPT: string = V1_IMPLEMENTED_SCENE_TYPES.map(
  (type) => `  - ${type}: ${SCENE_CATALOG[type]}`,
).join('\n');
```

- [ ] **Step 3.2: Run full storyboard worker test suite**

```bash
cd workers/storyboard
npx vitest run
```

Expected: all existing tests still PASS (the prompt text changes but no tests assert exact scene type lists in that way)

- [ ] **Step 3.3: Commit**

```bash
git add workers/storyboard/src/prompts/sceneTypeCatalog.ts
git commit -m "feat(storyboard): unlock BentoGrid + CursorDemo in V1_IMPLEMENTED_SCENE_TYPES"
```

---

## Task 4: systemPrompt.ts — Creativity Directive + Rhythm Liberation

**Files:**
- Modify: `workers/storyboard/src/prompts/systemPrompt.ts`

- [ ] **Step 4.1: Replace `systemPrompt.ts`**

```typescript
import { AVAILABLE_SCENES_PROMPT, V1_IMPLEMENTED_SCENE_TYPES } from './sceneTypeCatalog.js';
import { getPacingRules, type PacingProfile } from './pacingProfiles.js';

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

const CREATIVITY_DIRECTIVE = `
CREATIVITY DIRECTIVE — read this before choosing your scene sequence:

Do not default to the same scene sequence for every video. The best storyboard matches this specific product's personality — not a generic template.

Before choosing scene order, ask yourself:
- Does this product deserve a visual HeroRealShot open, or a punchy TextPunch hook that names the problem first?
- Should 3+ small features be shown individually (FeatureCallout × N) or together in a BentoGrid?
- Is there a user interaction worth demonstrating with CursorDemo, rather than a static screenshot?
- Would a SmoothScroll on the full-page capture convey depth better than another FeatureCallout?

Vary your approach intentionally. A storyboard that could fit any product fits none.
`.trim();

const RHYTHM_TEMPLATES = `
RHYTHM TEMPLATES — suggested starting points, not rules. Adapt freely to the product's personality.

10s (300 frames) — 3-4 scenes suggested:
- Suggested: HeroRealShot → FeatureCallout → CTA (optionally add one TextPunch between)
- Note: BentoGrid and CursorDemo are not recommended for 10s — too little time to be effective.

30s (900 frames) — 5-7 scenes suggested:
- Default:            HeroRealShot → FeatureCallout × 2-3 → TextPunch → CTA
- Feature-dense:      HeroRealShot → BentoGrid → TextPunch → CTA
- Interaction-first:  TextPunch (hook) → CursorDemo → FeatureCallout × 2 → CTA
- Scroll-heavy:       HeroRealShot → SmoothScroll → FeatureCallout × 2 → CTA

60s (1800 frames) — 7-10 scenes suggested:
- Default:       HeroRealShot → FeatureCallout × 3-4 → TextPunch × 2 → SmoothScroll → CTA
- Demo-heavy:    TextPunch → HeroRealShot → CursorDemo × 2 → FeatureCallout × 2 → BentoGrid → CTA
- Visual-story:  HeroRealShot → SmoothScroll → BentoGrid → TextPunch → FeatureCallout × 2 → CTA

These are starting points. Mix and match. Generic is failure.
`.trim();

export interface BuildSystemPromptOpts {
  profile?: PacingProfile;
}

export function buildSystemPrompt(opts: BuildSystemPromptOpts = {}): string {
  const rules = getPacingRules(opts.profile ?? 'default');
  const pacingBlock = rules.systemPromptAddition
    ? `\n\nPACING PROFILE — ${rules.profile.toUpperCase()}\n${rules.systemPromptAddition}`
    : '';

  return `You are a video storyboard editor for a URL-to-demo-video generation system. Given crawler-extracted brand and content data from a website, plus a user's intent, produce a structured JSON storyboard that a Remotion renderer will turn into an MP4.

SCENE TYPES (v1 implemented subset):
${AVAILABLE_SCENES_PROMPT}

${HARD_RULES}

${CREATIVITY_DIRECTIVE}

${RHYTHM_TEMPLATES}${pacingBlock}

YOUR OUTPUT must be a valid Storyboard JSON object matching the structure described above. Nothing else.`;
}
```

- [ ] **Step 4.2: Run full storyboard worker test suite**

```bash
cd workers/storyboard
npx vitest run
```

Expected: all tests PASS

- [ ] **Step 4.3: Commit**

```bash
git add workers/storyboard/src/prompts/systemPrompt.ts
git commit -m "feat(storyboard): add CREATIVITY_DIRECTIVE, liberate RHYTHM_TEMPLATES to suggestive"
```

---

## Task 5: BentoGrid.tsx — Remotion Scene Component

**Files:**
- Create: `packages/remotion/src/scenes/BentoGrid.tsx`
- Create: `packages/remotion/tests/bentoGrid.test.ts`

- [ ] **Step 5.1: Write failing tests for the pure grid logic**

Create `packages/remotion/tests/bentoGrid.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getColumnCount } from '../src/scenes/BentoGrid.js';

describe('BentoGrid — getColumnCount', () => {
  it('returns 2 for 3 items', () => expect(getColumnCount(3)).toBe(2));
  it('returns 2 for 4 items', () => expect(getColumnCount(4)).toBe(2));
  it('returns 3 for 5 items', () => expect(getColumnCount(5)).toBe(3));
  it('returns 3 for 6 items', () => expect(getColumnCount(6)).toBe(3));
});
```

- [ ] **Step 5.2: Run tests — confirm they fail**

```bash
cd packages/remotion
npx vitest run tests/bentoGrid.test.ts
```

Expected: FAIL — `Cannot find module '../src/scenes/BentoGrid.js'`

- [ ] **Step 5.3: Create `BentoGrid.tsx`**

Create `packages/remotion/src/scenes/BentoGrid.tsx`:

```typescript
import React from 'react';
import { AbsoluteFill, useCurrentFrame, spring } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export function getColumnCount(itemCount: number): number {
  return itemCount <= 4 ? 2 : 3;
}

export interface BentoGridProps {
  items: Array<{ title: string; description?: string; iconHint?: string }>;
  theme: BrandTheme;
}

export const BentoGrid: React.FC<BentoGridProps> = ({ items, theme }) => {
  const frame = useCurrentFrame();
  const columns = getColumnCount(items.length);

  return (
    <AbsoluteFill
      style={{
        background: '#0a0a0a',
        padding: 80,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 24,
        }}
      >
        {items.map((item, i) => {
          const progress = spring({
            frame: frame - i * 5,
            fps: 30,
            config: { stiffness: 180, damping: 22, mass: 1 },
          });
          return (
            <div
              key={i}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderBottom: `2px solid ${theme.primary}`,
                borderRadius: 16,
                padding: 24,
                opacity: progress,
                transform: `scale(${0.85 + 0.15 * progress})`,
              }}
            >
              {item.iconHint && (
                <div style={{ fontSize: 32, marginBottom: 12 }}>{item.iconHint}</div>
              )}
              <div
                style={{
                  color: '#ffffff',
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  marginBottom: 8,
                }}
              >
                {item.title}
              </div>
              {item.description && (
                <div style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1.5 }}>
                  {item.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 5.4: Run tests — confirm they pass**

```bash
cd packages/remotion
npx vitest run tests/bentoGrid.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5.5: Commit**

```bash
git add packages/remotion/src/scenes/BentoGrid.tsx packages/remotion/tests/bentoGrid.test.ts
git commit -m "feat(remotion): add BentoGrid scene with stagger spring animation"
```

---

## Task 6: CursorDemo.tsx — Remotion Scene Component

**Files:**
- Create: `packages/remotion/src/scenes/CursorDemo.tsx`
- Create: `packages/remotion/tests/cursorDemo.test.ts`

- [ ] **Step 6.1: Write failing tests for pure logic functions**

Create `packages/remotion/tests/cursorDemo.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { REGION_COORDS, bezierQuad } from '../src/scenes/CursorDemo.js';

describe('REGION_COORDS', () => {
  it('covers all 9 compass regions', () => {
    const expected = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
    expected.forEach((r) => expect(REGION_COORDS[r]).toBeDefined());
  });

  it('center region is at 50%/50%', () => {
    expect(REGION_COORDS['center']).toEqual({ x: 0.50, y: 0.50 });
  });

  it('top-left region is in the top-left quadrant', () => {
    const { x, y } = REGION_COORDS['top-left'];
    expect(x).toBeLessThan(0.3);
    expect(y).toBeLessThan(0.3);
  });

  it('bottom-right region is in the bottom-right quadrant', () => {
    const { x, y } = REGION_COORDS['bottom-right'];
    expect(x).toBeGreaterThan(0.7);
    expect(y).toBeGreaterThan(0.7);
  });
});

describe('bezierQuad', () => {
  it('returns p0 when t=0', () => {
    expect(bezierQuad(0, 10, 50, 100)).toBe(10);
  });

  it('returns p2 when t=1', () => {
    expect(bezierQuad(1, 10, 50, 100)).toBe(100);
  });

  it('returns midpoint-ish value at t=0.5', () => {
    // Quadratic Bezier at t=0.5: 0.25*p0 + 0.5*p1 + 0.25*p2
    const result = bezierQuad(0.5, 0, 50, 100);
    expect(result).toBeCloseTo(50, 1); // symmetric control point → midpoint
  });
});
```

- [ ] **Step 6.2: Run tests — confirm they fail**

```bash
cd packages/remotion
npx vitest run tests/cursorDemo.test.ts
```

Expected: FAIL — `Cannot find module '../src/scenes/CursorDemo.js'`

- [ ] **Step 6.3: Create `CursorDemo.tsx`**

Create `packages/remotion/src/scenes/CursorDemo.tsx`:

```typescript
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export const REGION_COORDS: Record<string, { x: number; y: number }> = {
  'top-left':    { x: 0.10, y: 0.15 },
  'top':         { x: 0.50, y: 0.15 },
  'top-right':   { x: 0.90, y: 0.15 },
  'left':        { x: 0.10, y: 0.50 },
  'center':      { x: 0.50, y: 0.50 },
  'right':       { x: 0.90, y: 0.50 },
  'bottom-left': { x: 0.10, y: 0.85 },
  'bottom':      { x: 0.50, y: 0.85 },
  'bottom-right':{ x: 0.90, y: 0.85 },
};

export function bezierQuad(t: number, p0: number, p1: number, p2: number): number {
  return (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
}

export interface CursorDemoProps {
  action: 'Click' | 'Scroll' | 'Hover' | 'Type';
  targetHint: { region: string };
  targetDescription: string;
  screenshotUrl?: string;
  durationInFrames: number;
  theme: BrandTheme;
}

const W = 1920;
const H = 1080;

// Cursor starts off-screen bottom-left, arcs to target via quadratic Bezier
const START_X = -0.05;
const START_Y = 1.10;
const CTRL_X = 0.28;
const CTRL_Y = 0.42;

export const CursorDemo: React.FC<CursorDemoProps> = ({
  action,
  targetHint,
  targetDescription,
  screenshotUrl,
  durationInFrames,
  theme,
}) => {
  const frame = useCurrentFrame();
  const target = REGION_COORDS[targetHint.region] ?? REGION_COORDS['center'];

  const moveEnd = Math.floor(durationInFrames * 0.4);
  const actionStart = moveEnd;
  const actionEnd = durationInFrames;

  // Movement phase: t goes 0→1 over first 40% of scene
  const t = interpolate(frame, [0, moveEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cursorX = bezierQuad(t, START_X, CTRL_X, target.x) * W;
  const cursorY = bezierQuad(t, START_Y, CTRL_Y, target.y) * H;

  const actionFrame = Math.max(0, frame - actionStart);
  const actionDuration = actionEnd - actionStart;

  // Click: ripple ring expands and fades over 18 frames
  const rippleProgress =
    action === 'Click' && frame >= actionStart
      ? interpolate(actionFrame, [0, 18], [0, 1], { extrapolateRight: 'clamp' })
      : 0;

  // Hover: cursor pulse scale — 2 full cycles over action duration
  const hoverScale =
    action === 'Hover'
      ? 1 + 0.15 * Math.sin((actionFrame / Math.max(1, actionDuration)) * Math.PI * 4)
      : 1;

  // Scroll: cursor drifts up 40px
  const scrollDrift =
    action === 'Scroll'
      ? interpolate(actionFrame, [0, actionDuration], [0, -40], {
          extrapolateRight: 'clamp',
        })
      : 0;

  // Type: reveal one character every 3 frames (cursor blinks at 15fps half-cycle)
  const charsVisible = action === 'Type' ? Math.floor(actionFrame / 3) : 0;
  const typedText = targetDescription.slice(0, charsVisible);
  const cursorBlink = frame % 30 < 15;

  return (
    <AbsoluteFill style={{ background: '#0a0a0a', overflow: 'hidden' }}>
      {screenshotUrl && (
        <Img
          src={screenshotUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
        />
      )}

      {/* SVG cursor */}
      <div
        style={{
          position: 'absolute',
          left: cursorX,
          top: cursorY + scrollDrift,
          transform: `scale(${hoverScale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))',
        }}
      >
        <svg width="36" height="44" viewBox="0 0 36 44" fill="none">
          <path
            d="M4 2L4 34L14 24L20 40L25 37.5L19 21.5L32 21.5L4 2Z"
            fill="white"
            stroke="#222"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Click ripple */}
      {action === 'Click' && frame >= actionStart && rippleProgress > 0 && (
        <div
          style={{
            position: 'absolute',
            left: target.x * W,
            top: target.y * H,
            width: 60 + 100 * rippleProgress,
            height: 60 + 100 * rippleProgress,
            borderRadius: '50%',
            border: `3px solid ${theme.primary}`,
            opacity: 1 - rippleProgress,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {/* Type label */}
      {action === 'Type' && typedText && (
        <div
          style={{
            position: 'absolute',
            left: target.x * W + 44,
            top: target.y * H + 44,
            background: 'rgba(0,0,0,0.85)',
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 20,
            fontFamily: 'monospace',
            maxWidth: 400,
            whiteSpace: 'pre-wrap',
          }}
        >
          {typedText}
          <span style={{ opacity: cursorBlink ? 1 : 0 }}>|</span>
        </div>
      )}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 6.4: Run tests — confirm they pass**

```bash
cd packages/remotion
npx vitest run tests/cursorDemo.test.ts
```

Expected: 7 tests PASS

- [ ] **Step 6.5: Commit**

```bash
git add packages/remotion/src/scenes/CursorDemo.tsx packages/remotion/tests/cursorDemo.test.ts
git commit -m "feat(remotion): add CursorDemo scene with Bezier cursor + 4 action animations"
```

---

## Task 7: resolveScene.tsx — Wire BentoGrid + CursorDemo

**Files:**
- Modify: `packages/remotion/src/resolveScene.tsx`

- [ ] **Step 7.1: Update `resolveScene.tsx`**

Add imports and replace the `throw` stubs for BentoGrid and CursorDemo. The complete updated file:

```typescript
import React from 'react';
import type { Scene, Storyboard } from '@lumespec/schema';
import { HeroRealShot } from './scenes/HeroRealShot';
import { FeatureCallout } from './scenes/FeatureCallout';
import { TextPunch } from './scenes/TextPunch';
import { SmoothScroll } from './scenes/SmoothScroll';
import { CTA } from './scenes/CTA';
import { BentoGrid } from './scenes/BentoGrid';
import { CursorDemo } from './scenes/CursorDemo';
import type { BrandTheme } from './utils/brandTheme';

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
    case 'FeatureCallout': {
      const viewportSrc = resolver(assets.screenshots.viewport);
      const fullPageSrc = resolver(assets.screenshots.fullPage);
      return (
        <FeatureCallout
          title={scene.props.title}
          description={scene.props.description}
          layout={scene.props.layout}
          theme={theme}
          variant={scene.props.variant}
          {...(viewportSrc ? { viewportSrc } : {})}
          {...(fullPageSrc ? { fullPageSrc } : {})}
        />
      );
    }
    case 'TextPunch':
      return <TextPunch text={scene.props.text} emphasis={scene.props.emphasis} theme={theme} />;
    case 'SmoothScroll': {
      const screenshotUrl = resolver(assets.screenshots.fullPage);
      if (!screenshotUrl) throw new Error('SmoothScroll requires assets.screenshots.fullPage');
      return (
        <SmoothScroll
          screenshotUrl={screenshotUrl}
          url={url}
          speed={scene.props.speed}
          theme={theme}
          durationInFrames={scene.durationInFrames}
        />
      );
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
    case 'BentoGrid':
      return <BentoGrid items={scene.props.items} theme={theme} />;
    case 'CursorDemo': {
      const screenshotUrl = resolver(assets.screenshots.viewport);
      return (
        <CursorDemo
          action={scene.props.action}
          targetHint={scene.props.targetHint}
          targetDescription={scene.props.targetDescription}
          {...(screenshotUrl ? { screenshotUrl } : {})}
          durationInFrames={scene.durationInFrames}
          theme={theme}
        />
      );
    }
    case 'HeroStylized':
    case 'UseCaseStory':
    case 'StatsBand':
      throw new Error(
        `scene type "${scene.type}" is deferred to v1.1 and not implemented in v1.0`
      );
  }
}
```

- [ ] **Step 7.2: Run the full remotion test suite**

```bash
cd packages/remotion
npx vitest run
```

Expected: all tests PASS (including `resolveScene.test.tsx` which will now exercise the BentoGrid + CursorDemo branches without throwing)

- [ ] **Step 7.3: Run full repo test suite**

```bash
pnpm -r test
```

Expected: all 340+ tests PASS, no regressions

- [ ] **Step 7.4: Commit**

```bash
git add packages/remotion/src/resolveScene.tsx
git commit -m "feat(remotion): wire BentoGrid + CursorDemo into resolveScene dispatch"
```

- [ ] **Step 7.5: Final push**

```bash
git push origin main
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Section 1 (Scene Catalog): `V1_IMPLEMENTED_SCENE_TYPES` expanded in Task 3; BentoGrid.tsx in Task 5; CursorDemo.tsx in Task 6; resolveScene wiring in Task 7
- ✅ Section 2 (Industry Detection): `industryDetect.ts` in Task 1; `userMessage.ts` injection in Task 2
- ✅ Section 3 (Rhythm + Creativity): `systemPrompt.ts` updated in Task 4
- ✅ CursorDemo region enum uses Zod schema values (`'top'` not `'top-center'`) — confirmed by reading `storyboard.ts`
- ✅ `STYLE_MODIFIERS['default']` returns empty string (no guidance block appended) — tested in Task 2
- ✅ BentoGrid grid column logic (2 cols for ≤4 items, 3 cols for 5-6) — extracted as `getColumnCount`, tested in Task 5

**Type consistency:**
- `getColumnCount` exported from BentoGrid.tsx, imported in test as `getColumnCount` — consistent
- `REGION_COORDS` and `bezierQuad` exported from CursorDemo.tsx, imported in test — consistent
- `detectIndustry` and `STYLE_MODIFIERS` exported from `industryDetect.ts`, imported in `userMessage.ts` and tests — consistent
- `scene.props.targetHint` typed as `{ region: string }` in CursorDemo props — matches `REGION_COORDS` lookup which takes `string` key — consistent
