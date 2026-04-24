import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJobStream } from '../../src/lib/useJobStream';

class MockEventSource {
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  listeners: Record<string, ((e: MessageEvent) => void)[]> = {};
  closed = false;
  constructor(url: string) {
    this.url = url;
    instances.push(this);
  }
  addEventListener(type: string, listener: (e: MessageEvent) => void) {
    (this.listeners[type] = this.listeners[type] ?? []).push(listener);
  }
  close() {
    this.closed = true;
  }
  fire(event: string, data: unknown) {
    const evt = new MessageEvent('message', { data: JSON.stringify(data) });
    this.listeners[event]?.forEach((l) => l(evt));
  }
}
let instances: MockEventSource[] = [];

beforeEach(() => {
  instances = [];
  (globalThis as any).EventSource = MockEventSource;
});

afterEach(() => {
  delete (globalThis as any).EventSource;
});

describe('useJobStream', () => {
  it('updates stage + progress on progress events', () => {
    const { result } = renderHook(() => useJobStream('http://api/stream/j1'));
    expect(result.current.stage).toBeNull();
    act(() => instances[0]!.fire('progress', { stage: 'crawl', pct: 40 }));
    expect(result.current.stage).toBe('crawl');
    expect(result.current.progress).toBe(40);
  });

  it('sets videoUrl on done', () => {
    const { result } = renderHook(() => useJobStream('http://api/stream/j1'));
    act(() => instances[0]!.fire('done', { videoUrl: 's3://b/v.mp4' }));
    expect(result.current.videoUrl).toBe('s3://b/v.mp4');
  });

  it('sets error on error event', () => {
    const { result } = renderHook(() => useJobStream('http://api/stream/j1'));
    act(() =>
      instances[0]!.fire('error', { code: 'CRAWL_FAILED', message: 'nope', retryable: false })
    );
    expect(result.current.error?.code).toBe('CRAWL_FAILED');
  });

  it('captures queued position', () => {
    const { result } = renderHook(() => useJobStream('http://api/stream/j1'));
    act(() => instances[0]!.fire('queued', { position: 5, aheadOfYou: 4 }));
    expect(result.current.queuedPosition).toBe(5);
  });

  it('closes EventSource on unmount', () => {
    const { unmount } = renderHook(() => useJobStream('http://api/stream/j1'));
    unmount();
    expect(instances[0]!.closed).toBe(true);
  });

  it('applies initial snapshot when snapshot event received', () => {
    const { result } = renderHook(() => useJobStream('http://api/stream/j1'));
    act(() =>
      instances[0]!.fire('snapshot', {
        jobId: 'j1',
        status: 'crawling',
        stage: 'crawl',
        progress: 10,
        input: { url: 'https://x.com', intent: 'x', duration: 30 },
        fallbacks: [],
        createdAt: 1,
        updatedAt: 1,
      })
    );
    expect(result.current.stage).toBe('crawl');
    expect(result.current.progress).toBe(10);
    expect(result.current.status).toBe('crawling');
  });
});
