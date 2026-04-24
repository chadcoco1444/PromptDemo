import { describe, it, expect } from 'vitest';
import { loadMockStoryboard } from '../src/mockMode.js';

describe('loadMockStoryboard', () => {
  it('returns valid 10s fixture', async () => {
    const sb = await loadMockStoryboard(10);
    expect(sb.videoConfig.durationInFrames).toBe(300);
  });
  it('returns valid 30s fixture', async () => {
    const sb = await loadMockStoryboard(30);
    expect(sb.videoConfig.durationInFrames).toBe(900);
  });
  it('returns valid 60s fixture', async () => {
    const sb = await loadMockStoryboard(60);
    expect(sb.videoConfig.durationInFrames).toBe(1800);
  });
});
