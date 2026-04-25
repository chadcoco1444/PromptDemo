import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LandingFooter } from '../../../src/components/landing/LandingFooter';

describe('LandingFooter', () => {
  it('renders all four column headings', () => {
    render(<LandingFooter />);
    expect(screen.getByText('Company')).toBeTruthy();
    expect(screen.getByText('Product')).toBeTruthy();
    expect(screen.getByText('Support')).toBeTruthy();
    expect(screen.getByText('Legal')).toBeTruthy();
  });

  it('renders copyright text', () => {
    render(<LandingFooter />);
    expect(screen.getByText(/2026 LumeSpec Inc/)).toBeTruthy();
  });

  it('renders GitHub social link', () => {
    render(<LandingFooter />);
    const links = screen.getAllByRole('link');
    const github = links.find(l => (l as HTMLAnchorElement).href.includes('github.com'));
    expect(github).toBeTruthy();
  });
});
