# Phase 2: Overlay Blocker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inject a curated CSS rule into every Playwright crawl immediately before screenshots to hide GDPR cookie banners and live-chat widgets without any false-positive risk.

**Architecture:** One new pure-constant module (`overlayBlocker.ts`) + one line added to `playwrightTrack.ts` after `page.content()` and before `page.screenshot()`. All 17 selectors are gathered in one place for easy maintenance.

**Tech Stack:** TypeScript, Playwright, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-26-overlay-blocker-design.md`

---

## File Map

| File | Action |
|------|--------|
| `workers/crawler/src/overlayBlocker.ts` | Create |
| `workers/crawler/tests/overlayBlocker.test.ts` | Create |
| `workers/crawler/src/tracks/playwrightTrack.ts` | Modify (1 import + 1 line) |

---

### Task 1: overlayBlocker module + tests + playwrightTrack integration

**Files:**
- Create: `workers/crawler/src/overlayBlocker.ts`
- Create: `workers/crawler/tests/overlayBlocker.test.ts`
- Modify: `workers/crawler/src/tracks/playwrightTrack.ts`

- [ ] **Step 1: Write the failing tests**

Create `workers/crawler/tests/overlayBlocker.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { OVERLAY_BLOCKER_CSS } from '../src/overlayBlocker.js';

describe('OVERLAY_BLOCKER_CSS', () => {
  // Cookie / Consent platforms
  it('covers OneTrust banner', () => expect(OVERLAY_BLOCKER_CSS).toContain('#onetrust-banner-sdk'));
  it('covers OneTrust modal', () => expect(OVERLAY_BLOCKER_CSS).toContain('#onetrust-consent-sdk'));
  it('covers Cookiebot', () => expect(OVERLAY_BLOCKER_CSS).toContain('#CybotCookiebotDialog'));
  it('covers Osano', () => expect(OVERLAY_BLOCKER_CSS).toContain('.osano-cm-widget'));
  it('covers CookieYes', () => expect(OVERLAY_BLOCKER_CSS).toContain('.cky-consent-container'));
  it('covers Termly', () => expect(OVERLAY_BLOCKER_CSS).toContain('#termly-code-snippet-support'));
  it('covers Cookie Consent cc-window', () => expect(OVERLAY_BLOCKER_CSS).toContain('.cc-window'));
  // Live Chat & Support
  it('covers Intercom container', () => expect(OVERLAY_BLOCKER_CSS).toContain('#intercom-container'));
  it('covers Intercom lightweight', () => expect(OVERLAY_BLOCKER_CSS).toContain('.intercom-lightweight-app'));
  it('covers Drift widget', () => expect(OVERLAY_BLOCKER_CSS).toContain('#drift-widget'));
  it('covers Drift frame container', () => expect(OVERLAY_BLOCKER_CSS).toContain('#drift-frame-container'));
  it('covers HubSpot chat', () => expect(OVERLAY_BLOCKER_CSS).toContain('#hubspot-messages-iframe-container'));
  it('covers Crisp', () => expect(OVERLAY_BLOCKER_CSS).toContain('.crisp-client'));
  it('covers Freshchat', () => expect(OVERLAY_BLOCKER_CSS).toContain('#fc_frame'));
  it('covers Zendesk', () => expect(OVERLAY_BLOCKER_CSS).toContain('zendesk'));
  it('covers Tidio', () => expect(OVERLAY_BLOCKER_CSS).toContain('#tidio-chat'));
  it('covers Zoho SalesIQ', () => expect(OVERLAY_BLOCKER_CSS).toContain('[data-id="zsalesiq"]'));
  // Structure
  it('applies display none !important', () => expect(OVERLAY_BLOCKER_CSS).toContain('display: none !important'));
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm --filter @lumespec/crawler test -- --reporter=verbose --testNamePattern="OVERLAY_BLOCKER_CSS"
```

Expected: 18 tests fail (module not found).

- [ ] **Step 3: Create `workers/crawler/src/overlayBlocker.ts`**

```ts
export const OVERLAY_BLOCKER_CSS = `
/* === LumeSpec Overlay Blocker v1 === */

/* Cookie / Consent Banners */
#onetrust-banner-sdk,
#onetrust-consent-sdk,
#CybotCookiebotDialog,
.osano-cm-widget,
.cky-consent-container,
#termly-code-snippet-support,
.cc-window,

/* Live Chat & Support Widgets */
#intercom-container,
.intercom-lightweight-app,
#drift-widget,
#drift-frame-container,
#hubspot-messages-iframe-container,
.crisp-client,
#fc_frame,
iframe[src*="zendesk"],
#tidio-chat,
[data-id="zsalesiq"]

{ display: none !important; }
`.trim();
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm --filter @lumespec/crawler test -- --reporter=verbose --testNamePattern="OVERLAY_BLOCKER_CSS"
```

Expected: 18 tests pass.

- [ ] **Step 5: Integrate into `playwrightTrack.ts`**

In `workers/crawler/src/tracks/playwrightTrack.ts`:

**Add import** (after the existing imports, e.g. after line 13):
```ts
import { OVERLAY_BLOCKER_CSS } from '../overlayBlocker.js';
```

**Add injection** between `const codeSnippets = extractCodeSnippets(html);` (line 90) and `const viewportScreenshot = await page.screenshot(...)` (line 92):
```ts
    // Suppress overlays (cookie banners, chat widgets) before screenshots
    await page.addStyleTag({ content: OVERLAY_BLOCKER_CSS });
```

The resulting block should read:
```ts
    const codeSnippets = extractCodeSnippets(html);

    // Suppress overlays (cookie banners, chat widgets) before screenshots
    await page.addStyleTag({ content: OVERLAY_BLOCKER_CSS });

    const viewportScreenshot = await page.screenshot({ type: 'jpeg', quality: 88, fullPage: false });
    const fullPageScreenshot = await page.screenshot({ type: 'jpeg', quality: 80, fullPage: true });
```

- [ ] **Step 6: Run full crawler test suite**

```bash
pnpm --filter @lumespec/crawler test
```

Expected: all tests pass (existing + 18 new overlay tests).

- [ ] **Step 7: Run typecheck**

```bash
pnpm --filter @lumespec/crawler typecheck
```

Expected: no errors.

- [ ] **Step 8: Run global typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add workers/crawler/src/overlayBlocker.ts workers/crawler/tests/overlayBlocker.test.ts workers/crawler/src/tracks/playwrightTrack.ts docs/superpowers/specs/2026-04-26-overlay-blocker-design.md docs/superpowers/plans/2026-04-26-phase2-overlay-blocker.md
git commit -m "feat(crawler): Phase 2 overlay blocker — curated CSS suppression before screenshots

- Add overlayBlocker.ts with OVERLAY_BLOCKER_CSS constant covering 7 cookie/consent
  platforms (OneTrust, Cookiebot, Osano, CookieYes, Termly, cc-window) and 9 live chat
  widgets (Intercom x2, Drift x2, HubSpot, Crisp, Freshchat, Zendesk, Tidio, Zoho SalesIQ)
- Inject via page.addStyleTag() after page.content() extraction and immediately before
  page.screenshot() in playwrightTrack.ts — CDP-level injection bypasses page CSP
- 18 unit tests verify every selector is present and display:none !important is applied
- Existing click-based cookie banner dismissal is preserved as the primary mechanism;
  CSS injection is the backstop for any remaining overlays"
```
