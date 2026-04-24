import { describe, it, expect } from 'vitest';
import { deriveTheme } from '../src/utils/brandTheme.js';

describe('deriveTheme', () => {
  it('returns the input as primary', () => {
    const t = deriveTheme('#4f46e5');
    expect(t.primary).toBe('#4f46e5');
  });

  it('produces a lighter primaryLight than primary', () => {
    const t = deriveTheme('#000000');
    expect(t.primaryLight).not.toBe('#000000');
    expect(t.primaryLight.toLowerCase()).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('produces a darker primaryDark than primary', () => {
    const t = deriveTheme('#ffffff');
    expect(t.primaryDark).not.toBe('#ffffff');
  });

  it('returns black text for light primary', () => {
    const t = deriveTheme('#ffff00'); // yellow
    expect(t.textOn).toBe('#000000');
  });

  it('returns white text for dark primary', () => {
    const t = deriveTheme('#1a1a1a');
    expect(t.textOn).toBe('#ffffff');
  });
});
