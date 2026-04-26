# Phase 2: Overlay Blocker — Curated CSS Suppression for Playwright Screenshots

**Goal:** Ensure all Playwright-captured screenshots are free of GDPR cookie banners and live-chat widget launchers, without risk of hiding legitimate page UI.

**Approach:** Curated list (v1) — explicit CSS selectors for known services only. No heuristics. Zero false-positive risk.

---

## Architecture

**New module:** `workers/crawler/src/overlayBlocker.ts`
Exports a single constant `OVERLAY_BLOCKER_CSS` — a CSS string with `display: none !important` applied to all known overlay selectors. No logic, no dependencies. Easy to review and extend.

**Injection mechanism:** `page.addStyleTag({ content: OVERLAY_BLOCKER_CSS })`
Playwright's `addStyleTag` uses the Chrome DevTools Protocol, which bypasses the page's Content-Security-Policy. `display: none !important` wins over all inline styles and site CSS specificity. Pure CSS — no JS execution overhead.

**Defence-in-depth order in `playwrightTrack.ts`:**
1. `page.goto()` + `waitForTimeout(800)` — page settles
2. Cookie banner click loop (existing) — semantic acceptance, may unlock gated content
3. `waitForTimeout(300)` — DOM flush after click
4. `page.content()` — capture raw HTML for Cheerio extractors (before CSS injection, so extracted text is unaffected)
5. Cheerio extractions (text, features, reviews, logos, code)
6. **`page.addStyleTag(OVERLAY_BLOCKER_CSS)`** ← NEW, immediately before screenshots
7. `page.screenshot()` ← clean capture

Injecting after `page.content()` ensures text/feature extraction sees the original unmodified HTML. Injecting before `page.screenshot()` ensures all overlays are hidden at capture time.

---

## Curated Selector List (v1)

### Cookie / Consent Banners

| Service | Selector |
|---------|----------|
| OneTrust (banner) | `#onetrust-banner-sdk` |
| OneTrust (modal) | `#onetrust-consent-sdk` |
| Cookiebot | `#CybotCookiebotDialog` |
| Osano | `.osano-cm-widget` |
| CookieYes | `.cky-consent-container` |
| Termly | `#termly-code-snippet-support` |
| Cookie Consent (Oskar Liljeblad) | `.cc-window` |

### Live Chat & Support Widgets

| Service | Selector |
|---------|----------|
| Intercom (main container) | `#intercom-container` |
| Intercom (lazy-loaded) | `.intercom-lightweight-app` |
| Drift (widget) | `#drift-widget` |
| Drift (iframe wrapper) | `#drift-frame-container` |
| HubSpot | `#hubspot-messages-iframe-container` |
| Crisp | `.crisp-client` |
| Freshchat / Freshdesk | `#fc_frame` |
| Zendesk (iframe) | `iframe[src*="zendesk"]` |
| Tidio | `#tidio-chat` |
| Zoho SalesIQ | `[data-id="zsalesiq"]` |

---

## File Map

| File | Action |
|------|--------|
| `workers/crawler/src/overlayBlocker.ts` | Create — exports `OVERLAY_BLOCKER_CSS` string constant |
| `workers/crawler/tests/overlayBlocker.test.ts` | Create — 17 assertions, one per selector + structure checks |
| `workers/crawler/src/tracks/playwrightTrack.ts` | Modify — add import, add `page.addStyleTag` call between line 90 and 92 |

---

## Testing

Unit tests verify the CSS string contains every expected selector and uses `display: none !important`. No browser required — pure string assertions. Integration tests (real Playwright against a live URL) are out of scope for v1 and covered by manual QA during stress testing.

---

## Design Decisions

**Curated list, not heuristic:** False positives (hiding legitimate UI like sticky navs or important CTAs) would degrade the screenshot quality this feature exists to protect. A missed selector is recoverable by adding one line; a hidden nav ruins every screenshot of that site.

**CSS inject, not script blocking:** Blocking third-party script loads (`page.route()`) can cause JS error cascades that break page layout. CSS hiding is purely cosmetic and provably safe.

**After `page.content()`, before screenshots:** Extractors parse raw HTML (Cheerio); the injected `<style>` tag being present or absent doesn't affect them. Screenshots must see the clean page.
