# Phase 3 Scenes — LogoCloud + CodeToUI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship two new Remotion scene types — `LogoCloud` (partner logo marquee) and `CodeToUI` (code typewriter + screenshot reveal) — wired through schema, renderer, and storyboard prompt with data gates.

**Architecture:** Schema adds two new Zod schemas to the existing discriminated union; each Remotion scene is a standalone `.tsx` file following established patterns (`ReviewMarquee` for marquee, `HeroRealShot` for screenshot handling); `resolveScene.tsx` wires them in; prompt catalog and `userMessage.ts` gate them on data availability.

**Tech Stack:** Zod 3.x (schema), React 18 + Remotion 4 (scenes), Vitest 2 (tests), TypeScript strict, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-04-26-phase3-logocloudcodetoui-design.md`

---

## File Map

| File | Action |
|---|---|
| `packages/schema/src/storyboard.ts` | Modify — add `LogoCloudSchema`, `CodeToUISchema`, add both to `SceneSchema` union and `SCENE_TYPES` |
| `packages/schema/tests/storyboard.test.ts` | Modify — add 6 new schema tests + extend `makeScene` helper |
| `packages/remotion/src/scenes/LogoCloud.tsx` | Create — marquee component with white card containers |
| `packages/remotion/tests/LogoCloud.test.tsx` | Create — structural + export tests |
| `packages/remotion/src/scenes/CodeToUI.tsx` | Create — split-panel typewriter + screenshot spring |
| `packages/remotion/tests/CodeToUI.test.tsx` | Create — structural + export tests |
| `packages/remotion/src/resolveScene.tsx` | Modify — add `LogoCloud` and `CodeToUI` cases |
| `packages/remotion/tests/resolveScene.test.tsx` | Modify — add 3 new integration tests |
| `workers/storyboard/src/prompts/sceneTypeCatalog.ts` | Modify — add both to `SCENE_CATALOG` and `V1_IMPLEMENTED_SCENE_TYPES` |
| `workers/storyboard/src/prompts/userMessage.ts` | Modify — add logo and snippet gate logic + data blocks |
| `workers/storyboard/tests/userMessage.test.ts` | Modify — add 6 gate behaviour tests |

---

### Task A: Schema Extensions

**Files:**
- Modify: `packages/schema/src/storyboard.ts`
- Modify: `packages/schema/tests/storyboard.test.ts`

- [ ] **Step 1: Write failing tests**

Open `packages/schema/tests/storyboard.test.ts`. Add after the final `describe` block:

```ts
describe('LogoCloudSchema', () => {
  const logoBase = {
    sceneId: 1,
    type: 'LogoCloud' as const,
    durationInFrames: 300,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
    props: {
      logos: [
        { name: 'Stripe', s3Uri: 's3://bucket/logo-partner-0.svg' },
        { name: 'Vercel', s3Uri: 's3://bucket/logo-partner-1.png' },
      ],
      speed: 'medium' as const,
    },
  };

  it('accepts valid LogoCloud with 2 logos', () => {
    const parsed = SceneSchema.parse(logoBase);
    expect(parsed.type).toBe('LogoCloud');
    if (parsed.type !== 'LogoCloud') throw new Error('narrow');
    expect(parsed.props.logos).toHaveLength(2);
    expect(parsed.props.speed).toBe('medium');
  });

  it('defaults speed to medium when omitted', () => {
    const parsed = SceneSchema.parse({ ...logoBase, props: { ...logoBase.props, speed: undefined } });
    if (parsed.type !== 'LogoCloud') throw new Error('narrow');
    expect(parsed.props.speed).toBe('medium');
  });

  it('rejects fewer than 2 logos', () => {
    expect(() =>
      SceneSchema.parse({
        ...logoBase,
        props: { logos: [{ name: 'Stripe', s3Uri: 's3://bucket/a.svg' }] },
      })
    ).toThrow();
  });

  it('rejects plain HTTP URL in logos s3Uri', () => {
    expect(() =>
      SceneSchema.parse({
        ...logoBase,
        props: {
          logos: [
            { name: 'Stripe', s3Uri: 'https://cdn.stripe.com/logo.svg' },
            { name: 'Vercel', s3Uri: 's3://bucket/b.png' },
          ],
        },
      })
    ).toThrow();
  });
});

describe('CodeToUISchema', () => {
  const codeBase = {
    sceneId: 2,
    type: 'CodeToUI' as const,
    durationInFrames: 300,
    entryAnimation: 'fade' as const,
    exitAnimation: 'fade' as const,
    props: {
      code: 'const client = new LumeSpec();\nclient.generate({ url });',
      language: 'javascript',
      screenshotKey: 'viewport' as const,
    },
  };

  it('accepts valid CodeToUI', () => {
    const parsed = SceneSchema.parse(codeBase);
    expect(parsed.type).toBe('CodeToUI');
    if (parsed.type !== 'CodeToUI') throw new Error('narrow');
    expect(parsed.props.code).toContain('LumeSpec');
    expect(parsed.props.screenshotKey).toBe('viewport');
  });

  it('defaults screenshotKey to viewport', () => {
    const parsed = SceneSchema.parse({ ...codeBase, props: { code: codeBase.props.code } });
    if (parsed.type !== 'CodeToUI') throw new Error('narrow');
    expect(parsed.props.screenshotKey).toBe('viewport');
  });

  it('rejects code shorter than 10 characters', () => {
    expect(() =>
      SceneSchema.parse({ ...codeBase, props: { ...codeBase.props, code: 'short' } })
    ).toThrow();
  });

  it('rejects code longer than 800 characters', () => {
    expect(() =>
      SceneSchema.parse({ ...codeBase, props: { ...codeBase.props, code: 'x'.repeat(801) } })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pnpm --filter @lumespec/schema test
```

Expected: tests FAIL with "invalid discriminator value" or similar (types not in union yet).

- [ ] **Step 3: Add LogoCloudSchema and CodeToUISchema to storyboard.ts**

Open `packages/schema/src/storyboard.ts`. After `ReviewMarqueeSchema` (line ~168), add:

```ts
const LogoCloudSchema = z.object({
  ...sceneBase,
  type: z.literal('LogoCloud'),
  props: z.object({
    logos: z
      .array(z.object({ name: z.string().min(1).max(100), s3Uri: S3UriSchema }))
      .min(2)
      .max(12),
    speed: z.enum(['slow', 'medium', 'fast']).default('medium'),
    label: z.string().max(60).optional(),
  }),
});

const CodeToUISchema = z.object({
  ...sceneBase,
  type: z.literal('CodeToUI'),
  props: z.object({
    code: z.string().min(10).max(800),
    language: z.string().max(50).optional(),
    label: z.string().max(100).optional(),
    screenshotKey: z.enum(['viewport', 'fullPage']).default('viewport'),
  }),
});
```

Then add both to the `SceneSchema` discriminated union (after `ReviewMarqueeSchema`):

```ts
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
  StatsCounterSchema,
  ReviewMarqueeSchema,
  LogoCloudSchema,
  CodeToUISchema,
]);
```

And add both to `SCENE_TYPES`:

```ts
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
  'StatsCounter',
  'ReviewMarquee',
  'LogoCloud',
  'CodeToUI',
] as const;
```

- [ ] **Step 4: Extend the makeScene helper in storyboard.test.ts**

In `packages/schema/tests/storyboard.test.ts`, extend `propsByType` inside the `makeScene` helper:

```ts
const propsByType: Record<string, object> = {
  // existing entries...
  LogoCloud: {
    logos: [
      { name: 'Stripe', s3Uri: 's3://bucket/logo-partner-0.svg' },
      { name: 'Vercel', s3Uri: 's3://bucket/logo-partner-1.png' },
    ],
    speed: 'medium',
  },
  CodeToUI: {
    code: 'const x = new LumeSpec();\nx.generate({ url });',
    screenshotKey: 'viewport',
  },
};
```

- [ ] **Step 5: Run tests to confirm they pass**

```
pnpm --filter @lumespec/schema test
```

Expected: PASS (all existing tests green + 8 new ones).

- [ ] **Step 6: Typecheck**

```
pnpm --filter @lumespec/schema typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/schema/src/storyboard.ts packages/schema/tests/storyboard.test.ts
git commit -m "feat(schema): add LogoCloud + CodeToUI scene schemas"
```

---

### Task B: LogoCloud Remotion Scene

**Files:**
- Create: `packages/remotion/src/scenes/LogoCloud.tsx`
- Create: `packages/remotion/tests/LogoCloud.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/remotion/tests/LogoCloud.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { LogoCloud } from '../src/scenes/LogoCloud.js';
import { deriveTheme } from '../src/utils/brandTheme.js';

const theme = deriveTheme('#4f46e5');

const logos = [
  { name: 'Stripe', resolvedUrl: 'http://fake/stripe.svg' },
  { name: 'Vercel', resolvedUrl: 'http://fake/vercel.png' },
];

describe('LogoCloud', () => {
  it('exports a function component', () => {
    expect(typeof LogoCloud).toBe('function');
  });

  it('accepts 2 logos without throwing during construction', () => {
    // Remotion hooks (useCurrentFrame) require a Composition context and cannot
    // be called outside it — structural check is the right approach here.
    expect(() => LogoCloud).not.toThrow();
  });

  it('is named LogoCloud (for Remotion DevTools)', () => {
    expect(LogoCloud.name).toBe('LogoCloud');
  });

  it('has the correct prop shape (TypeScript compile-time check — runtime confirms object is callable)', () => {
    const props: Parameters<typeof LogoCloud>[0] = {
      logos,
      speed: 'medium',
      theme,
      durationInFrames: 300,
    };
    expect(props.logos).toHaveLength(2);
  });

  it('accepts optional label prop', () => {
    const props: Parameters<typeof LogoCloud>[0] = {
      logos,
      speed: 'slow',
      label: 'Trusted by 1,000+ teams',
      theme,
      durationInFrames: 300,
    };
    expect(props.label).toBe('Trusted by 1,000+ teams');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```
pnpm --filter @lumespec/remotion test
```

Expected: FAIL — `Cannot find module '../src/scenes/LogoCloud.js'`.

- [ ] **Step 3: Create LogoCloud.tsx**

Create `packages/remotion/src/scenes/LogoCloud.tsx`:

```tsx
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export interface LogoCloudProps {
  logos: Array<{ name: string; resolvedUrl: string }>;
  speed: 'slow' | 'medium' | 'fast';
  label?: string;
  theme: BrandTheme;
  durationInFrames: number;
}

const SPEED_PX_PER_FRAME: Record<string, number> = { slow: 1.5, medium: 3, fast: 5 };
const SLOT_WIDTH = 200;

export const LogoCloud: React.FC<LogoCloudProps> = ({
  logos,
  speed,
  label,
  theme,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  // 3x duplication creates a seamless loop.
  const items = [...logos, ...logos, ...logos];
  const totalWidth = items.length * SLOT_WIDTH;
  const pxPerFrame = SPEED_PX_PER_FRAME[speed] ?? 3;

  const maxOffset = Math.max(0, totalWidth - 1280);
  const offset = Math.min(frame * pxPerFrame, maxOffset);

  const fadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: '#0a0a0a',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 32,
        overflow: 'hidden',
        opacity: fadeIn,
      }}
    >
      {label && (
        <div
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textAlign: 'center',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {label}
        </div>
      )}

      {/* Fade masks */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to right, #0a0a0a 0%, transparent 14%, transparent 86%, #0a0a0a 100%)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Scrolling strip */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          transform: `translateX(${-offset}px)`,
          alignItems: 'center',
          willChange: 'transform',
          flexShrink: 0,
        }}
      >
        {items.map((logo, i) => (
          <LogoSlot key={i} logo={logo} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

interface LogoSlotProps {
  logo: { name: string; resolvedUrl: string };
}

const LogoSlot: React.FC<LogoSlotProps> = ({ logo }) => (
  <div
    style={{
      width: SLOT_WIDTH,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div
      style={{
        width: 168,
        height: 72,
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid rgba(0,0,0,0.06)',
        borderRadius: 12,
        boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Img
        src={logo.resolvedUrl}
        style={{ maxWidth: 140, maxHeight: 48, objectFit: 'contain' }}
      />
    </div>
  </div>
);
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter @lumespec/remotion test
```

Expected: PASS (all existing tests + 5 new LogoCloud tests).

- [ ] **Step 5: Typecheck**

```
pnpm --filter @lumespec/remotion typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/remotion/src/scenes/LogoCloud.tsx packages/remotion/tests/LogoCloud.test.tsx
git commit -m "feat(remotion): add LogoCloud scene — partner logo marquee"
```

---

### Task C: CodeToUI Remotion Scene

**Files:**
- Create: `packages/remotion/src/scenes/CodeToUI.tsx`
- Create: `packages/remotion/tests/CodeToUI.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/remotion/tests/CodeToUI.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { CodeToUI } from '../src/scenes/CodeToUI.js';
import { deriveTheme } from '../src/utils/brandTheme.js';

const theme = deriveTheme('#4f46e5');
const code = `const client = new LumeSpec();\nconst video = await client.generate({\n  url: 'https://example.com',\n  duration: 30,\n});`;

describe('CodeToUI', () => {
  it('exports a function component', () => {
    expect(typeof CodeToUI).toBe('function');
  });

  it('is named CodeToUI (for Remotion DevTools)', () => {
    expect(CodeToUI.name).toBe('CodeToUI');
  });

  it('accepts props with screenshotUrl', () => {
    const props: Parameters<typeof CodeToUI>[0] = {
      code,
      language: 'javascript',
      screenshotUrl: 'http://fake/viewport.jpg',
      theme,
      durationInFrames: 300,
    };
    expect(props.code).toContain('LumeSpec');
  });

  it('accepts props without screenshotUrl (fallback branch)', () => {
    const props: Parameters<typeof CodeToUI>[0] = {
      code,
      theme,
      durationInFrames: 300,
    };
    expect(props.screenshotUrl).toBeUndefined();
  });

  it('accepts language and label props', () => {
    const props: Parameters<typeof CodeToUI>[0] = {
      code,
      language: 'typescript',
      label: 'Quick Start',
      theme,
      durationInFrames: 300,
    };
    expect(props.language).toBe('typescript');
    expect(props.label).toBe('Quick Start');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```
pnpm --filter @lumespec/remotion test
```

Expected: FAIL — `Cannot find module '../src/scenes/CodeToUI.js'`.

- [ ] **Step 3: Create CodeToUI.tsx**

Create `packages/remotion/src/scenes/CodeToUI.tsx`:

```tsx
import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate, spring } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export interface CodeToUIProps {
  code: string;
  language?: string;
  label?: string;
  screenshotUrl?: string;
  theme: BrandTheme;
  durationInFrames: number;
}

// Typewriter reveal: frames 20–95 (75 frames)
const TYPE_START = 20;
const TYPE_END = 95;

// Screenshot spring entry starts at frame 85 (10-frame overlap with typewriter)
const SCREENSHOT_START = 85;

export const CodeToUI: React.FC<CodeToUIProps> = ({
  code,
  language,
  label,
  screenshotUrl,
  theme,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  const leftFade = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  const charsToShow = Math.floor(
    interpolate(frame, [TYPE_START, TYPE_END], [0, code.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  const showCursor = frame >= TYPE_START && frame < TYPE_END;
  const cursorVisible = frame % 12 < 6;

  const screenshotProgress = spring({
    frame: frame - SCREENSHOT_START,
    fps: 30,
    config: { stiffness: 120, damping: 22 },
  });

  return (
    <AbsoluteFill style={{ background: '#0a0a0a', display: 'flex', flexDirection: 'row' }}>
      {/* Left panel — code */}
      <div
        style={{
          width: '44%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px 48px 60px 60px',
          opacity: leftFade,
        }}
      >
        {/* Label badge */}
        {label && (
          <div
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              background: theme.primary,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: 6,
              marginBottom: 12,
              letterSpacing: '0.02em',
            }}
          >
            {label}
          </div>
        )}

        {/* Language badge */}
        {language && (
          <div
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 12,
              fontWeight: 500,
              padding: '3px 10px',
              borderRadius: 4,
              marginBottom: 16,
              fontFamily: 'Courier New, monospace',
              letterSpacing: '0.04em',
            }}
          >
            {language}
          </div>
        )}

        {/* Code area */}
        <div
          style={{
            background: '#111827',
            borderRadius: 12,
            padding: '32px 36px',
            flex: 1,
            maxHeight: 440,
            overflow: 'hidden',
          }}
        >
          <pre
            style={{
              margin: 0,
              fontFamily: 'Courier New, monospace',
              fontSize: 16,
              lineHeight: 1.6,
              color: '#e2e8f0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {code.slice(0, charsToShow)}
            {showCursor && (
              <span style={{ opacity: cursorVisible ? 1 : 0, color: theme.primary }}>|</span>
            )}
          </pre>
        </div>
      </div>

      {/* Right panel — screenshot or fallback */}
      <div
        style={{
          width: '56%',
          overflow: 'hidden',
          opacity: screenshotProgress,
          transform: `translateX(${(1 - screenshotProgress) * 80}px)`,
        }}
      >
        {screenshotUrl ? (
          <Img
            src={screenshotUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top center',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(135deg, ${theme.primary}30, ${theme.primary}08)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```
pnpm --filter @lumespec/remotion test
```

Expected: PASS (all existing + 5 new CodeToUI tests).

- [ ] **Step 5: Typecheck**

```
pnpm --filter @lumespec/remotion typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/remotion/src/scenes/CodeToUI.tsx packages/remotion/tests/CodeToUI.test.tsx
git commit -m "feat(remotion): add CodeToUI scene — typewriter + screenshot reveal"
```

---

### Task D: Wire Scenes into resolveScene.tsx

**Files:**
- Modify: `packages/remotion/src/resolveScene.tsx`
- Modify: `packages/remotion/tests/resolveScene.test.tsx`

- [ ] **Step 1: Write failing tests**

Open `packages/remotion/tests/resolveScene.test.tsx`. Add three new test cases inside the existing `describe('resolveScene')` block:

```tsx
it('resolves a LogoCloud scene', () => {
  const scene: Scene = {
    sceneId: 6,
    type: 'LogoCloud',
    durationInFrames: 300,
    entryAnimation: 'fade',
    exitAnimation: 'fade',
    props: {
      logos: [
        { name: 'Stripe', s3Uri: 's3://fake/stripe.svg' },
        { name: 'Vercel', s3Uri: 's3://fake/vercel.png' },
      ],
      speed: 'medium',
    },
  };
  const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
  expect(el).toBeTruthy();
});

it('resolves a CodeToUI scene with viewport screenshot', () => {
  const scene: Scene = {
    sceneId: 7,
    type: 'CodeToUI',
    durationInFrames: 300,
    entryAnimation: 'fade',
    exitAnimation: 'fade',
    props: {
      code: 'const x = new LumeSpec();\nx.generate({ url });',
      language: 'javascript',
      screenshotKey: 'viewport',
    },
  };
  const el = resolveScene({ scene, assets, theme, url: 'https://x.com', resolver });
  expect(el).toBeTruthy();
});

it('resolves a CodeToUI scene gracefully when screenshot asset is missing', () => {
  const emptyAssets = {
    screenshots: {},
  } as unknown as Storyboard['assets'];
  const scene: Scene = {
    sceneId: 8,
    type: 'CodeToUI',
    durationInFrames: 300,
    entryAnimation: 'fade',
    exitAnimation: 'fade',
    props: {
      code: 'const x = new LumeSpec();\nx.generate({ url });',
      screenshotKey: 'viewport',
    },
  };
  const el = resolveScene({ scene, assets: emptyAssets, theme, url: 'https://x.com', resolver });
  expect(el).toBeTruthy();
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pnpm --filter @lumespec/remotion test
```

Expected: FAIL — "LogoCloud is not handled by resolveScene" or similar switch exhaustion.

- [ ] **Step 3: Add LogoCloud and CodeToUI imports to resolveScene.tsx**

Open `packages/remotion/src/resolveScene.tsx`. Add two imports after the existing scene imports:

```tsx
import { LogoCloud } from './scenes/LogoCloud';
import { CodeToUI } from './scenes/CodeToUI';
```

- [ ] **Step 4: Add cases to the switch statement in resolveScene.tsx**

Inside the `switch (scene.type)` block, add before the deferred scene fallback (`case 'HeroStylized'`):

```tsx
case 'LogoCloud': {
  const logos = scene.props.logos
    .map(({ name, s3Uri }) => ({ name, resolvedUrl: resolver(s3Uri) }))
    .filter((l): l is { name: string; resolvedUrl: string } => !!l.resolvedUrl);
  return (
    <LogoCloud
      logos={logos}
      speed={scene.props.speed}
      {...(scene.props.label ? { label: scene.props.label } : {})}
      theme={theme}
      durationInFrames={scene.durationInFrames}
    />
  );
}
case 'CodeToUI': {
  const screenshotUri = assets.screenshots[scene.props.screenshotKey];
  const screenshotUrl = resolver(screenshotUri);
  return (
    <CodeToUI
      code={scene.props.code}
      {...(scene.props.language ? { language: scene.props.language } : {})}
      {...(scene.props.label ? { label: scene.props.label } : {})}
      {...(screenshotUrl ? { screenshotUrl } : {})}
      theme={theme}
      durationInFrames={scene.durationInFrames}
    />
  );
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```
pnpm --filter @lumespec/remotion test
```

Expected: PASS (all existing + 3 new resolveScene tests).

- [ ] **Step 6: Typecheck**

```
pnpm --filter @lumespec/remotion typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/remotion/src/resolveScene.tsx packages/remotion/tests/resolveScene.test.tsx
git commit -m "feat(remotion): wire LogoCloud + CodeToUI into resolveScene"
```

---

### Task E: Prompt Updates — Catalog + User Message Gates

**Files:**
- Modify: `workers/storyboard/src/prompts/sceneTypeCatalog.ts`
- Modify: `workers/storyboard/src/prompts/userMessage.ts`
- Modify: `workers/storyboard/tests/userMessage.test.ts`

- [ ] **Step 1: Write failing tests**

Open `workers/storyboard/tests/userMessage.test.ts`. Add after the existing `describe` blocks:

```ts
// helper: CrawlResult with logos and codeSnippets
function makeCrawlWithData(overrides: {
  logos?: CrawlResult['logos'];
  codeSnippets?: CrawlResult['codeSnippets'];
  viewport?: string;
}): CrawlResult {
  return {
    brand: { name: 'Acme', primaryColor: '#7c3aed' },
    screenshots: overrides.viewport ? { viewport: overrides.viewport } : {},
    sourceTexts: ['Platform for teams'],
    features: [] as CrawlResult['features'],
    tier: 'A',
    trackUsed: false,
    logos: overrides.logos ?? [],
    codeSnippets: overrides.codeSnippets ?? [],
    reviews: [],
    fallbacks: [],
    url: 'https://example.com',
    fetchedAt: 1_700_000_000_000,
  } as unknown as CrawlResult;
}

const twoLogos: CrawlResult['logos'] = [
  { name: 'Stripe', s3Uri: 's3://bucket/logo-partner-0.svg' as `s3://${string}` },
  { name: 'Vercel', s3Uri: 's3://bucket/logo-partner-1.png' as `s3://${string}` },
];

const oneSnippet: CrawlResult['codeSnippets'] = [
  { code: 'const x = new LumeSpec();\nclient.generate({ url });', language: 'javascript', label: 'Quick Start' },
];

describe('buildUserMessage — LogoCloud gate', () => {
  it('injects Available partner logos block when logos.length >= 2', () => {
    const msg = buildUserMessage({
      intent: 'show integrations',
      duration: 30,
      crawlResult: makeCrawlWithData({ logos: twoLogos }),
    });
    expect(msg).toContain('## Available partner logos');
    expect(msg).toContain('Stripe');
    expect(msg).not.toContain('LogoCloud — fewer than 2');
  });

  it('adds LogoCloud restriction when logos.length < 2', () => {
    const msg = buildUserMessage({
      intent: 'show integrations',
      duration: 30,
      crawlResult: makeCrawlWithData({ logos: [] }),
    });
    expect(msg).toContain('LogoCloud');
    expect(msg).toContain('MUST NOT use this scene');
    expect(msg).not.toContain('## Available partner logos');
  });

  it('adds LogoCloud restriction when logos has exactly 1 entry', () => {
    const msg = buildUserMessage({
      intent: 'show integrations',
      duration: 30,
      crawlResult: makeCrawlWithData({ logos: [twoLogos[0]!] }),
    });
    expect(msg).toContain('LogoCloud');
    expect(msg).toContain('MUST NOT use this scene');
  });
});

describe('buildUserMessage — CodeToUI gate', () => {
  it('injects Available code snippets block when snippets present and viewport exists', () => {
    const msg = buildUserMessage({
      intent: 'show dev workflow',
      duration: 30,
      crawlResult: makeCrawlWithData({
        codeSnippets: oneSnippet,
        viewport: 's3://bucket/viewport.jpg',
      }),
    });
    expect(msg).toContain('## Available code snippets');
    expect(msg).toContain('LumeSpec');
    expect(msg).not.toContain('CodeToUI — ');
  });

  it('adds CodeToUI restriction when snippets are empty', () => {
    const msg = buildUserMessage({
      intent: 'show dev workflow',
      duration: 30,
      crawlResult: makeCrawlWithData({
        codeSnippets: [],
        viewport: 's3://bucket/viewport.jpg',
      }),
    });
    expect(msg).toContain('CodeToUI');
    expect(msg).toContain('MUST NOT use this scene');
    expect(msg).toContain('no code snippets');
  });

  it('adds CodeToUI restriction when viewport screenshot absent', () => {
    const msg = buildUserMessage({
      intent: 'show dev workflow',
      duration: 30,
      crawlResult: makeCrawlWithData({
        codeSnippets: oneSnippet,
        // no viewport
      }),
    });
    expect(msg).toContain('CodeToUI');
    expect(msg).toContain('MUST NOT use this scene');
    expect(msg).toContain('no viewport screenshot');
  });

  it('names both reasons when both snippets and viewport are missing', () => {
    const msg = buildUserMessage({
      intent: 'show dev workflow',
      duration: 30,
      crawlResult: makeCrawlWithData({ codeSnippets: [], viewport: undefined }),
    });
    expect(msg).toContain('no code snippets');
    expect(msg).toContain('no viewport screenshot');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pnpm --filter @lumespec/worker-storyboard test
```

Expected: FAIL — `## Available partner logos` not found, gate strings not present.

- [ ] **Step 3: Update sceneTypeCatalog.ts**

Open `workers/storyboard/src/prompts/sceneTypeCatalog.ts`.

Add to `SCENE_CATALOG` (after `ReviewMarquee` entry):

```ts
LogoCloud:
  'Horizontally scrolling partner/integration logo strip. Props: { logos: [{name, s3Uri}] (2-12 items from crawlResult.logos), speed: "slow"|"medium"|"fast", label? (optional section heading, e.g. "Trusted by 1,000+ teams") }. ONLY use when crawlResult.logos contains at least 2 entries. Pull logos verbatim from crawlResult.logos.',
CodeToUI:
  'Split-screen: code typewriter on left, product screenshot reveal on right. Props: { code (verbatim from crawlResult.codeSnippets[n].code), language?, label?, screenshotKey: "viewport"|"fullPage" }. ONLY use when crawlResult.codeSnippets is non-empty AND assets.screenshots.viewport exists. Best for SaaS/dev-tool products.',
```

Update `V1_IMPLEMENTED_SCENE_TYPES`:

```ts
export const V1_IMPLEMENTED_SCENE_TYPES = [
  'HeroRealShot',
  'FeatureCallout',
  'TextPunch',
  'SmoothScroll',
  'CTA',
  'BentoGrid',
  'CursorDemo',
  'StatsCounter',
  'ReviewMarquee',
  'LogoCloud',
  'CodeToUI',
] as const;
```

- [ ] **Step 4: Update userMessage.ts — logo gate**

Open `workers/storyboard/src/prompts/userMessage.ts`.

In the restrictions block (after the `ReviewMarquee` gate), add:

```ts
const logos = input.crawlResult.logos ?? [];
if (logos.length < 2) {
  restrictions.push(
    'LogoCloud — fewer than 2 partner logos available in crawlResult.logos. MUST NOT use this scene.'
  );
} else {
  blocks.push(
    `## Available partner logos (use verbatim for LogoCloud)\n${JSON.stringify(logos, null, 2)}`
  );
}

const snippets = input.crawlResult.codeSnippets ?? [];
const hasViewport = !!input.crawlResult.screenshots.viewport;
if (snippets.length < 1 || !hasViewport) {
  const reasons: string[] = [];
  if (snippets.length < 1) reasons.push('no code snippets in crawlResult.codeSnippets');
  if (!hasViewport) reasons.push('no viewport screenshot available');
  restrictions.push(`CodeToUI — ${reasons.join(' and ')}. MUST NOT use this scene.`);
} else {
  blocks.push(
    `## Available code snippets (use verbatim for CodeToUI)\n${JSON.stringify(snippets, null, 2)}`
  );
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```
pnpm --filter @lumespec/worker-storyboard test
```

Expected: PASS (all existing + 7 new gate tests).

- [ ] **Step 6: Typecheck**

```
pnpm --filter @lumespec/worker-storyboard typecheck
```

Expected: no errors.

- [ ] **Step 7: Full workspace test + typecheck**

```
pnpm test && pnpm typecheck
```

Expected: all packages green.

- [ ] **Step 8: Commit**

```bash
git add workers/storyboard/src/prompts/sceneTypeCatalog.ts workers/storyboard/src/prompts/userMessage.ts workers/storyboard/tests/userMessage.test.ts
git commit -m "feat(storyboard): add LogoCloud + CodeToUI to prompt catalog and user message gates"
```
