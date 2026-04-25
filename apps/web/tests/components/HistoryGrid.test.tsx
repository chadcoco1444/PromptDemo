import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HistoryGrid } from '../../src/components/HistoryGrid';

const ORIGINAL_FETCH = globalThis.fetch;

function mockFetchOnce(jobs: unknown[]) {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ jobs }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  ) as typeof fetch;
}

beforeEach(() => {
  // jsdom doesn't have fetch by default in node 20 — vitest provides it,
  // but per-test we replace with a stub.
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

describe('HistoryGrid status bucketing', () => {
  it('shows "Generating" for in-flight statuses (queued/crawling/generating/rendering)', async () => {
    mockFetchOnce([
      {
        jobId: 'a',
        status: 'crawling',
        stage: 'crawl',
        input: { url: 'https://x.com', intent: 'show it', duration: 30 },
        videoUrl: null,
        thumbUrl: null,
        coverUrl: null,
        createdAt: Date.now(),
      },
      {
        jobId: 'b',
        status: 'rendering',
        stage: 'render',
        input: { url: 'https://y.com', intent: 'demo', duration: 30 },
        videoUrl: null,
        thumbUrl: null,
        coverUrl: null,
        createdAt: Date.now(),
      },
    ]);
    render(<HistoryGrid />);
    await waitFor(() => {
      expect(screen.getAllByText('Generating').length).toBeGreaterThan(0);
    });
  });

  it('shows "Done" for status=done and "Failed" for status=failed', async () => {
    mockFetchOnce([
      {
        jobId: 'a',
        status: 'done',
        stage: 'render',
        input: { url: 'https://x.com', intent: 'show it', duration: 30 },
        videoUrl: 's3://b/v.mp4',
        thumbUrl: null,
        coverUrl: null,
        createdAt: Date.now(),
      },
      {
        jobId: 'b',
        status: 'failed',
        stage: null,
        input: { url: 'https://y.com', intent: 'demo', duration: 30 },
        videoUrl: null,
        thumbUrl: null,
        coverUrl: null,
        createdAt: Date.now(),
      },
    ]);
    render(<HistoryGrid />);
    await waitFor(() => {
      // Each card renders the label twice (cover-area placeholder + badge)
      // when coverUrl is null. We just want at least one of each.
      expect(screen.getAllByText('Done').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Failed').length).toBeGreaterThan(0);
    });
  });

  it('renders coverUrl image during Generating with opacity dim', async () => {
    mockFetchOnce([
      {
        jobId: 'a',
        status: 'generating',
        stage: 'storyboard',
        input: { url: 'https://x.com', intent: 'show it', duration: 30 },
        videoUrl: null,
        thumbUrl: null,
        coverUrl: '/api/jobs/a/cover',
        createdAt: Date.now(),
      },
    ]);
    const { container } = render(<HistoryGrid />);
    await waitFor(() => {
      const img = container.querySelector('img[src="/api/jobs/a/cover"]');
      expect(img).toBeTruthy();
      expect(img?.getAttribute('class')).toMatch(/opacity-70/);
    });
  });

  it('does NOT dim the cover for Done', async () => {
    mockFetchOnce([
      {
        jobId: 'a',
        status: 'done',
        stage: 'render',
        input: { url: 'https://x.com', intent: 'show it', duration: 30 },
        videoUrl: 's3://b/v.mp4',
        thumbUrl: null,
        coverUrl: '/api/jobs/a/cover',
        createdAt: Date.now(),
      },
    ]);
    const { container } = render(<HistoryGrid />);
    await waitFor(() => {
      const img = container.querySelector('img[src="/api/jobs/a/cover"]');
      expect(img).toBeTruthy();
      expect(img?.getAttribute('class')).not.toMatch(/opacity-70/);
    });
  });
});
