import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { HistoryCard, type HistoryJob } from '../../../src/components/history/HistoryCard';

const baseJob: HistoryJob = {
  jobId: 'abc',
  parentJobId: null,
  status: 'done',
  stage: 'render',
  input: { url: 'https://vercel.com', intent: 'show pricing', duration: 30 },
  videoUrl: 's3://b/v.mp4',
  thumbUrl: null,
  coverUrl: '/api/jobs/abc/cover',
  createdAt: Date.now() - 60_000,
  parent: null,
};

describe('HistoryCard', () => {
  it('renders hostname, intent, duration, and status badge', () => {
    render(<HistoryCard job={baseJob} tier="pro" />);
    expect(screen.getByText('vercel.com')).toBeInTheDocument();
    expect(screen.getByText(/show pricing/i)).toBeInTheDocument();
    expect(screen.getByText(/30s/i)).toBeInTheDocument();
    expect(screen.getAllByText(/done/i).length).toBeGreaterThan(0);
  });

  it('renders the cover image when coverUrl is set', () => {
    const { container } = render(<HistoryCard job={baseJob} tier="pro" />);
    expect(container.querySelector(`img[src='/api/jobs/abc/cover']`)).toBeTruthy();
  });

  it('renders the LineageBadge when parent is set', () => {
    render(
      <HistoryCard
        job={{
          ...baseJob,
          parentJobId: 'parent-1',
          parent: { jobId: 'parent-1', hostname: 'https://stripe.com', createdAt: Date.now() - 86400000 },
        }}
        tier="pro"
      />,
    );
    expect(screen.getByText(/from stripe\.com/i)).toBeInTheDocument();
  });

  it('does not render LineageBadge when parent is null', () => {
    render(<HistoryCard job={baseJob} tier="pro" />);
    expect(screen.queryByText(/from /i)).toBeNull();
    expect(screen.queryByText(/regenerated/i)).toBeNull();
  });

  it('links the whole card to /jobs/<jobId>', () => {
    render(<HistoryCard job={baseJob} tier="pro" />);
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/jobs/abc');
    expect(link).toBeTruthy();
  });

  it('shows download and fork buttons for done jobs', () => {
    render(<HistoryCard job={baseJob} tier="pro" />);
    expect(screen.getByText(/mp4/i)).toBeTruthy();
    expect(screen.getByText(/json/i)).toBeTruthy();
    expect(screen.getByText(/fork/i)).toBeTruthy();
  });

  it('hides action row for generating jobs', () => {
    const generatingJob = { ...baseJob, status: 'generating', videoUrl: null };
    render(<HistoryCard job={generatingJob} tier="pro" />);
    expect(screen.queryByText(/mp4/i)).toBeNull();
  });

  it('shows watermark upgrade hint for free tier done jobs', () => {
    render(<HistoryCard job={baseJob} tier="free" />);
    expect(screen.getByText(/upgrade/i)).toBeTruthy();
  });

  it('hides watermark hint for pro tier', () => {
    render(<HistoryCard job={baseJob} tier="pro" />);
    expect(screen.queryByText(/upgrade/i)).toBeNull();
  });
});
