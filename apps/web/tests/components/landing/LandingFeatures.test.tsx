import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LandingFeatures } from '../../../src/components/landing/LandingFeatures';

describe('LandingFeatures', () => {
  it('renders the section heading "Ship the demo, not the screenshot."', () => {
    render(<LandingFeatures />);
    expect(screen.getByText(/Ship the demo, not the screenshot\./i)).toBeInTheDocument();
  });

  it('renders all 3 feature titles', () => {
    render(<LandingFeatures />);
    expect(screen.getByText(/Zero-Touch Storyboarding/i)).toBeInTheDocument();
    expect(screen.getByText(/Intent-Driven Directing/i)).toBeInTheDocument();
    expect(screen.getByText(/Studio-Grade Polish/i)).toBeInTheDocument();
  });

  it('each feature has a descriptive body that mentions the underlying tool', () => {
    render(<LandingFeatures />);
    expect(screen.getByText(/Claude/i)).toBeInTheDocument();
    expect(screen.getByText(/pacing profiles/i)).toBeInTheDocument();
    expect(screen.getByText(/Remotion/i)).toBeInTheDocument();
  });
});
