// Companion to cookieBanner.ts which CLICKS accept buttons (semantic acceptance).
// This module HIDES overlays via CSS as a backstop for anything the click missed.
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

/* Custom Brand Cookie Banners */
[data-testid="cookie-settings-notification"],

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
