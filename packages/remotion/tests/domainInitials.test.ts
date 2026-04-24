import { describe, it, expect } from 'vitest';
import { domainInitials } from '../src/utils/domainInitials.js';

describe('domainInitials', () => {
  it('returns uppercase first letter of domain', () => {
    expect(domainInitials('https://acme.com')).toBe('A');
  });

  it('returns two letters for multi-word domains', () => {
    expect(domainInitials('https://acme-corp.com')).toBe('AC');
  });

  it('handles subdomains by stripping them', () => {
    expect(domainInitials('https://www.acme.com')).toBe('A');
    expect(domainInitials('https://app.globex.io')).toBe('G');
  });

  it('ignores common prefixes (www, app, m)', () => {
    expect(domainInitials('https://app.acme.com')).toBe('A');
  });

  it('returns "?" for malformed input', () => {
    expect(domainInitials('not-a-url')).toBe('?');
  });
});
