import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../../src/lib/useJobStream', () => ({
  useJobStream: vi.fn(),
}));

import { useJobStream } from '../../src/lib/useJobStream';
import { JobStatus } from '../../src/components/JobStatus';

const resolve = (s: string) => s.replace('s3://', 'http://cdn/');

describe('JobStatus', () => {
  it('renders stage + progress during crawling', () => {
    vi.mocked(useJobStream).mockReturnValue({
      status: 'crawling',
      stage: 'crawl',
      progress: 40,
      queuedPosition: null,
      videoUrl: null,
      error: null,
    });
    render(<JobStatus streamUrl="http://api/s" jobId="j1" resolveVideoUrl={resolve} />);
    expect(screen.getByText(/crawling/i)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  });

  it('renders queued message when waiting', () => {
    vi.mocked(useJobStream).mockReturnValue({
      status: 'waiting_render_slot',
      stage: 'render',
      progress: 0,
      queuedPosition: 3,
      videoUrl: null,
      error: null,
    });
    render(<JobStatus streamUrl="http://api/s" jobId="j1" resolveVideoUrl={resolve} />);
    expect(screen.getByText(/position 3/i)).toBeInTheDocument();
  });

  it('renders VideoResult on done', () => {
    vi.mocked(useJobStream).mockReturnValue({
      status: 'done',
      stage: 'render',
      progress: 100,
      queuedPosition: null,
      videoUrl: 's3://b/v.mp4',
      error: null,
    });
    const { container } = render(<JobStatus streamUrl="http://api/s" jobId="j1" resolveVideoUrl={resolve} />);
    expect(container.querySelector('video')?.getAttribute('src')).toBe('http://cdn/b/v.mp4');
  });

  it('renders ErrorCard on failed', () => {
    vi.mocked(useJobStream).mockReturnValue({
      status: 'failed',
      stage: 'crawl',
      progress: 0,
      queuedPosition: null,
      videoUrl: null,
      error: { code: 'CRAWL_FAILED', message: 'nope', retryable: false },
    });
    render(<JobStatus streamUrl="http://api/s" jobId="j1" resolveVideoUrl={resolve} />);
    // Friendly ErrorCard renders the stage-aware headline; raw CRAWL_FAILED
    // code lives in the collapsible details panel.
    expect(screen.getByText(/couldn.?t read your URL/i)).toBeInTheDocument();
  });
});
