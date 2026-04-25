import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { MarketingLanding } from '../../../src/components/landing/MarketingLanding';

describe('MarketingLanding', () => {
  it('renders all five sections: Hero, IntentShowcase, Features, FinalCTA, Footer', () => {
    render(<MarketingLanding />);
    // Hero: headline
    expect(screen.getByText(/From URL/i)).toBeInTheDocument();
    // IntentShowcase: section heading
    expect(screen.getByText(/Same URL\. Four different cuts/i)).toBeInTheDocument();
    // Features: section heading
    expect(screen.getByText(/Ship the demo, not the screenshot/i)).toBeInTheDocument();
    // Final CTA: closing headline
    expect(screen.getByText(/Ready to ship it/i)).toBeInTheDocument();
    // Footer: link cluster label (changed from h4 to p for a11y heading-order compliance)
    expect(screen.getByText('Product')).toBeInTheDocument();
  });
});
