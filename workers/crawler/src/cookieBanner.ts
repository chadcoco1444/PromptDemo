export const COOKIE_BANNER_SELECTORS: readonly string[] = [
  '#onetrust-accept-btn-handler',
  'button#onetrust-accept-btn-handler',
  '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
  '#CybotCookiebotDialogBodyButtonAccept',
  'button[aria-label="Accept all cookies"]',
  'button[aria-label*="Accept" i]',
  'button[data-test-id="cookie-policy-manage-dialog-accept-button"]',
  'button[data-cookieman-accept]',
  '.cc-allow',
  '.cc-accept',
  'button.cookie-accept',
  'button[id*="accept" i][id*="cookie" i]',
];

export function matchBannerSelector(tester: (selector: string) => boolean): string | null {
  for (const s of COOKIE_BANNER_SELECTORS) {
    if (tester(s)) return s;
  }
  return null;
}
