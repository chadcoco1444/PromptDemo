import { describe, it, expect, vi } from 'vitest';
import { makeBroker } from '../src/sse/broker.js';

describe('makeBroker', () => {
  it('fanouts published events to all subscribers of a job', () => {
    const b = makeBroker();
    const w1 = vi.fn();
    const w2 = vi.fn();
    b.subscribe('j1', w1);
    b.subscribe('j1', w2);
    b.publish('j1', { event: 'progress', data: { pct: 10 } });
    expect(w1).toHaveBeenCalledTimes(1);
    expect(w2).toHaveBeenCalledTimes(1);
  });

  it('does not deliver to other jobs', () => {
    const b = makeBroker();
    const w = vi.fn();
    b.subscribe('j1', w);
    b.publish('j2', { event: 'progress', data: {} });
    expect(w).not.toHaveBeenCalled();
  });

  it('returns dispose that unsubscribes', () => {
    const b = makeBroker();
    const w = vi.fn();
    const dispose = b.subscribe('j1', w);
    dispose();
    b.publish('j1', { event: 'progress', data: {} });
    expect(w).not.toHaveBeenCalled();
  });

  it('formats as SSE string', () => {
    const b = makeBroker();
    const w = vi.fn();
    b.subscribe('j1', w);
    b.publish('j1', { event: 'done', data: { videoUrl: 's3://x/y.mp4' } });
    expect(w.mock.calls[0]?.[0]).toMatch(/^event: done\ndata: \{"videoUrl":"s3:\/\/x\/y\.mp4"\}\n\n$/);
  });
});
