import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null, status: 'unauthenticated' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { LandingHero } from '../../../src/components/landing/LandingHero';

describe('LandingHero', () => {
  it('renders the headline copy on three lines', () => {
    render(<LandingHero />);
    expect(screen.getByText(/From URL/i)).toBeInTheDocument();
    expect(screen.getByText(/to demo video/i)).toBeInTheDocument();
    expect(screen.getByText(/sixty seconds/i)).toBeInTheDocument();
  });

  it('renders the eyebrow naming Claude + Remotion', () => {
    render(<LandingHero />);
    expect(screen.getByText(/Claude \+ Remotion/i)).toBeInTheDocument();
  });

  it('renders an autoplay/loop/muted/playsinline video pointing at /demo.mp4', () => {
    const { container } = render(<LandingHero />);
    const video = container.querySelector('video');
    expect(video).toBeTruthy();
    expect(video?.hasAttribute('autoplay') || video?.hasAttribute('autoPlay')).toBe(true);
    expect(video?.hasAttribute('loop')).toBe(true);
    expect(video?.hasAttribute('muted')).toBe(true);
    const src = video?.querySelector('source')?.getAttribute('src') ?? video?.getAttribute('src');
    expect(src).toBe('/demo.mp4');
  });

  it('renders the URL input with placeholder and Start button', () => {
    render(<LandingHero />);
    expect(screen.getByPlaceholderText(/https:\/\/your-product\.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });
});
