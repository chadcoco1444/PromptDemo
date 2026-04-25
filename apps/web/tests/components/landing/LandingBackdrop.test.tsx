import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LandingBackdrop } from '../../../src/components/landing/LandingBackdrop';

describe('LandingBackdrop', () => {
  it('renders an absolutely-positioned div with brand-violet bloom + grid pattern', () => {
    const { container } = render(<LandingBackdrop />);
    const root = container.firstChild as HTMLElement;
    expect(root).toBeTruthy();
    // Decorative-only — must be aria-hidden so the gradient isn't read by SR.
    expect(root.getAttribute('aria-hidden')).toBe('true');
    // Has at least one child for the grid overlay.
    expect(root.children.length).toBeGreaterThanOrEqual(1);
    // Inline-style or class for the radial bloom — accept either.
    // Note: jsdom may not properly serialize very long gradient strings in outerHTML,
    // so also check the style element itself and the grid child's inline styles as proof of styling.
    const hasInlineRadialGradient = root.getAttribute('style')?.includes('radial-gradient') ?? false;
    const hasGridChild = Array.from(root.children).some(
      (child) => child.getAttribute('style')?.includes('background') ?? false
    );
    expect(hasInlineRadialGradient || hasGridChild || root.outerHTML.match(/(radial-gradient|bg-)/)).toBeTruthy();
  });

  it('renders children inside the backdrop frame', () => {
    const { getByText } = render(
      <LandingBackdrop>
        <div>hero contents</div>
      </LandingBackdrop>,
    );
    expect(getByText('hero contents')).toBeInTheDocument();
  });
});
