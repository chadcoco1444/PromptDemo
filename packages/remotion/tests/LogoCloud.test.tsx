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

  it('is named LogoCloud (for Remotion DevTools)', () => {
    expect(LogoCloud.name).toBe('LogoCloud');
  });

  it('has the correct prop shape (TypeScript compile-time check)', () => {
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

  it('accepts all three speed values', () => {
    for (const speed of ['slow', 'medium', 'fast'] as const) {
      const props: Parameters<typeof LogoCloud>[0] = { logos, speed, theme, durationInFrames: 300 };
      expect(props.speed).toBe(speed);
    }
  });
});
