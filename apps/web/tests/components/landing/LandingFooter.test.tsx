import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingFooter } from '../../../src/components/landing/LandingFooter';

describe('LandingFooter', () => {
  it('renders the wordmark', () => {
    render(<LandingFooter />);
    const wordmarks = screen.getAllByText(/PromptDemo/i);
    expect(wordmarks.length).toBeGreaterThan(0);
  });

  it('renders three link clusters', () => {
    render(<LandingFooter />);
    expect(screen.getByText(/Product/i)).toBeInTheDocument();
    expect(screen.getByText(/Build/i)).toBeInTheDocument();
    expect(screen.getByText(/Legal/i)).toBeInTheDocument();
  });

  it('renders the dogfood credit', () => {
    render(<LandingFooter />);
    expect(screen.getByText(/Made with PromptDemo. Of course\./i)).toBeInTheDocument();
  });
});
