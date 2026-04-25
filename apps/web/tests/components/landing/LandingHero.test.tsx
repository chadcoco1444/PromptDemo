import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));

import { LandingHero } from '../../../src/components/landing/LandingHero';

describe('LandingHero', () => {
  it('renders the locked headline copy on three lines', () => {
    render(<LandingHero onAuthedSubmit={vi.fn()} />);
    expect(screen.getByText(/From URL/i)).toBeInTheDocument();
    expect(screen.getByText(/to demo video/i)).toBeInTheDocument();
    expect(screen.getByText(/Sixty seconds/i)).toBeInTheDocument();
  });

  it('renders the subhead naming Claude + Remotion', () => {
    render(<LandingHero onAuthedSubmit={vi.fn()} />);
    expect(screen.getByText(/Claude \+ Remotion/i)).toBeInTheDocument();
  });

  it('renders an autoplay/loop/muted/playsinline video pointing at /landing-hero-demo.mp4', () => {
    const { container } = render(<LandingHero onAuthedSubmit={vi.fn()} />);
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.getAttribute('autoplay')).not.toBeNull();
    expect(video?.getAttribute('loop')).not.toBeNull();
    expect(video?.getAttribute('muted')).not.toBeNull();
    expect(video?.getAttribute('playsinline')).not.toBeNull();
    const src = video?.querySelector('source')?.getAttribute('src') ?? video?.getAttribute('src');
    expect(src).toBe('/landing-hero-demo.mp4');
  });

  it('renders the form (URL field is the proof — wrapped by PreviewForm)', () => {
    render(<LandingHero onAuthedSubmit={vi.fn()} />);
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
  });
});
