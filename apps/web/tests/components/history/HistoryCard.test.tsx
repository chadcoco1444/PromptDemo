import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    render(<HistoryCard job={baseJob} />);
    expect(screen.getByText('vercel.com')).toBeInTheDocument();
    expect(screen.getByText(/show pricing/i)).toBeInTheDocument();
    expect(screen.getByText(/30s/i)).toBeInTheDocument();
    expect(screen.getAllByText(/done/i).length).toBeGreaterThan(0);
  });

  it('renders the cover image when coverUrl is set', () => {
    const { container } = render(<HistoryCard job={baseJob} />);
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
      />,
    );
    expect(screen.getByText(/from stripe\.com/i)).toBeInTheDocument();
  });

  it('does not render LineageBadge when parent is null', () => {
    render(<HistoryCard job={baseJob} />);
    expect(screen.queryByText(/from /i)).toBeNull();
    expect(screen.queryByText(/regenerated/i)).toBeNull();
  });

  it('links the whole card to /jobs/<jobId>', () => {
    render(<HistoryCard job={baseJob} />);
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '/jobs/abc');
    expect(link).toBeTruthy();
  });
});
