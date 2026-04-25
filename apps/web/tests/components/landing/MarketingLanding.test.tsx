import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

import { MarketingLanding } from '../../../src/components/landing/MarketingLanding';

describe('MarketingLanding', () => {
  it('renders all four sections in order: Hero, Features, FinalCTA, Footer', () => {
    render(<MarketingLanding onAuthedSubmit={vi.fn()} />);
    // Hero: headline
    expect(screen.getByText(/Sixty seconds/i)).toBeInTheDocument();
    // Features: section heading
    expect(screen.getByText(/Ship the demo, not the screenshot/i)).toBeInTheDocument();
    // Final CTA: closing headline
    expect(screen.getByText(/Ready to ship it/i)).toBeInTheDocument();
    // Footer: link cluster heading
    expect(screen.getByText(/Product/i)).toBeInTheDocument();
  });
});
