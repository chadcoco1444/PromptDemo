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
  // Custom brand cookie banners
  it('covers Stripe consent notification', () => expect(OVERLAY_BLOCKER_CSS).toContain('[data-testid="cookie-settings-notification"]'));
  // Live Chat & Support
  it('covers Intercom container', () => expect(OVERLAY_BLOCKER_CSS).toContain('#intercom-container'));
  it('covers Intercom lightweight', () => expect(OVERLAY_BLOCKER_CSS).toContain('.intercom-lightweight-app'));
  it('covers Drift widget', () => expect(OVERLAY_BLOCKER_CSS).toContain('#drift-widget'));
  it('covers Drift frame container', () => expect(OVERLAY_BLOCKER_CSS).toContain('#drift-frame-container'));
  it('covers HubSpot chat', () => expect(OVERLAY_BLOCKER_CSS).toContain('#hubspot-messages-iframe-container'));
  it('covers Crisp', () => expect(OVERLAY_BLOCKER_CSS).toContain('.crisp-client'));
  it('covers Freshchat', () => expect(OVERLAY_BLOCKER_CSS).toContain('#fc_frame'));
  it('covers Zendesk', () => expect(OVERLAY_BLOCKER_CSS).toContain('iframe[src*="zendesk"]'));
  it('covers Tidio', () => expect(OVERLAY_BLOCKER_CSS).toContain('#tidio-chat'));
  it('covers Zoho SalesIQ', () => expect(OVERLAY_BLOCKER_CSS).toContain('[data-id="zsalesiq"]'));
  // Structure
  it('applies display none !important', () => expect(OVERLAY_BLOCKER_CSS).toContain('display: none !important'));
});
