import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

import { HistoryGrid } from '../../src/components/HistoryGrid';

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchOnce(jobs: unknown[], hasMore = false, tier: 'free' | 'pro' | 'max' = 'free') {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ jobs, hasMore, tier }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('HistoryGrid', () => {
  it('renders FilterBar even when there are no jobs yet', async () => {
    mockFetchOnce([], false);
    render(<HistoryGrid />);
    await waitFor(() => {
      expect(screen.getByRole('searchbox')).toBeInTheDocument();
    });
  });

  it('renders cards once data loads', async () => {
    mockFetchOnce(
      [
        {
          jobId: 'a',
          parentJobId: null,
          status: 'done',
          stage: 'render',
          input: { url: 'https://x.com', intent: 'show pricing', duration: 30 },
          videoUrl: 's3://b/v.mp4',
          thumbUrl: null,
          coverUrl: '/api/jobs/a/cover',
          createdAt: Date.now(),
          parent: null,
        },
      ],
      false,
    );
    render(<HistoryGrid />);
    await waitFor(() => {
      expect(screen.getByText('x.com')).toBeInTheDocument();
    });
  });

  it('shows "No videos yet" empty state when no filters + no jobs', async () => {
    mockFetchOnce([], false);
    render(<HistoryGrid />);
    await waitFor(() => {
      expect(screen.getByText(/No videos yet/i)).toBeInTheDocument();
    });
  });

  it('renders upgrade hint for free-tier done job', async () => {
    mockFetchOnce(
      [{
        jobId: 'b',
        parentJobId: null,
        status: 'done',
        stage: 'render',
        input: { url: 'https://stripe.com', intent: 'pricing', duration: 30 },
        videoUrl: 's3://b/v.mp4',
        thumbUrl: null,
        coverUrl: null,
        createdAt: Date.now(),
        parent: null,
      }],
      false,
      'free',
    );
    render(<HistoryGrid />);
    await waitFor(() => {
      expect(screen.getByText(/upgrade/i)).toBeInTheDocument();
    });
  });
});

const jobFixture = {
  jobId: 'del-1',
  parentJobId: null,
  status: 'done',
  stage: 'render',
  input: { url: 'https://x.com', intent: 'show pricing', duration: 30 },
  videoUrl: 's3://b/v.mp4',
  thumbUrl: null,
  coverUrl: null,
  createdAt: Date.now(),
  parent: null,
};

describe('HistoryGrid — delete', () => {
  it('removes card from state when delete succeeds', async () => {
    mockFetchOnce([jobFixture], false);
    render(<HistoryGrid />);
    await waitFor(() => expect(screen.getByText('x.com')).toBeInTheDocument());

    // Mock the DELETE call
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    ) as typeof fetch;

    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('刪除'));

    await waitFor(() => expect(screen.queryByText('x.com')).toBeNull());
  });

  it('keeps card in state when delete fails', async () => {
    mockFetchOnce([jobFixture], false);
    render(<HistoryGrid />);
    await waitFor(() => expect(screen.getByText('x.com')).toBeInTheDocument());

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 500 }),
    ) as typeof fetch;

    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByText('刪除'));

    await waitFor(() => expect(screen.getByText(/刪除失敗/i)).toBeInTheDocument());
    expect(screen.getByText('x.com')).toBeInTheDocument();
  });
});
