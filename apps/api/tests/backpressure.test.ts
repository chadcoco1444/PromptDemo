import { describe, it, expect, vi } from 'vitest';
import { shouldDeferRender, renderQueueDepth } from '../src/orchestrator/backpressure.js';

describe('shouldDeferRender', () => {
  it('returns false when active below cap', () => {
    expect(shouldDeferRender({ active: 5, cap: 20 })).toBe(false);
  });
  it('returns true when active at cap', () => {
    expect(shouldDeferRender({ active: 20, cap: 20 })).toBe(true);
  });
  it('returns true when over cap (bug recovery safety)', () => {
    expect(shouldDeferRender({ active: 25, cap: 20 })).toBe(true);
  });
});

describe('renderQueueDepth', () => {
  it('delegates to BullMQ Queue.getJobCounts', async () => {
    const mockQueue = { getJobCounts: vi.fn().mockResolvedValue({ active: 7, waiting: 3 }) };
    const r = await renderQueueDepth(mockQueue as any);
    expect(r.active).toBe(7);
    expect(r.waiting).toBe(3);
  });
});
