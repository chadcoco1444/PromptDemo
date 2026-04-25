import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LandingBackdrop } from '../../../src/components/landing/LandingBackdrop';

describe('LandingBackdrop', () => {
  it('renders with brand-violet bloom + aria-hidden grid overlay child', () => {
    const { container } = render(<LandingBackdrop />);
    const root = container.firstChild as HTMLElement;
    expect(root).toBeTruthy();
    // Root should NOT be aria-hidden — it may wrap interactive content (form, buttons).
    expect(root.getAttribute('aria-hidden')).toBeNull();
    // Has at least one child for the grid overlay.
    expect(root.children.length).toBeGreaterThanOrEqual(1);
    // The decorative grid overlay child must be aria-hidden.
    const gridOverlay = Array.from(root.children).find(
      (child) => child.getAttribute('aria-hidden') === 'true'
    );
    expect(gridOverlay).toBeTruthy();
    // Inline-style or class for the radial bloom — accept either.
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
