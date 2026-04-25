import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingFinalCTA } from '../../../src/components/landing/LandingFinalCTA';

describe('LandingFinalCTA', () => {
  it('renders the closing headline', () => {
    render(<LandingFinalCTA />);
    expect(screen.getByText(/Ready to ship it\?/i)).toBeInTheDocument();
  });

  it('renders the free-tier subline', () => {
    render(<LandingFinalCTA />);
    expect(screen.getByText(/Free tier/i)).toBeInTheDocument();
  });

  it('renders a single primary CTA pointing at /create', () => {
    render(<LandingFinalCTA />);
    const cta = screen.getByText(/Start for free/i).closest('a');
    expect(cta).toBeInTheDocument();
    expect(cta).toHaveAttribute('href', '/create');
  });
});
