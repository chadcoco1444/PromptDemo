import { describe, it, expect } from 'vitest';
import { reduceEvent } from '../src/orchestrator/stateMachine.js';
import type { Job } from '../src/model/job.js';

const base: Job = {
  jobId: 'j1',
  status: 'queued',
  stage: null,
  progress: 0,
  input: { url: 'https://x.com', intent: 'x', duration: 30 },
  fallbacks: [],
  createdAt: 1,
  updatedAt: 1,
};

describe('reduceEvent', () => {
  it('crawl started → crawling stage', () => {
    const patch = reduceEvent(base, { kind: 'crawl:active' });
    expect(patch.status).toBe('crawling');
    expect(patch.stage).toBe('crawl');
    expect(patch.progress).toBe(0);
  });

  it('crawl done → generating stage with URI stored', () => {
    const patch = reduceEvent(base, {
      kind: 'crawl:completed',
      crawlResultUri: 's3://b/k/crawl.json' as any,
    });
    expect(patch.status).toBe('generating');
    expect(patch.stage).toBe('storyboard');
    expect(patch.crawlResultUri).toBe('s3://b/k/crawl.json');
  });

  it('storyboard done + render has capacity → rendering', () => {
    const patch = reduceEvent(base, {
      kind: 'storyboard:completed',
      storyboardUri: 's3://b/k/sb.json' as any,
      canRender: true,
    });
    expect(patch.status).toBe('rendering');
    expect(patch.stage).toBe('render');
    expect(patch.storyboardUri).toBe('s3://b/k/sb.json');
  });

  it('storyboard done + render full → waiting_render_slot', () => {
    const patch = reduceEvent(base, {
      kind: 'storyboard:completed',
      storyboardUri: 's3://b/k/sb.json' as any,
      canRender: false,
    });
    expect(patch.status).toBe('waiting_render_slot');
    expect(patch.stage).toBe('render');
  });

  it('render done → done with videoUrl', () => {
    const patch = reduceEvent(base, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any });
    expect(patch.status).toBe('done');
    expect(patch.videoUrl).toBe('s3://b/k/v.mp4');
    expect(patch.progress).toBe(100);
  });

  it('any failed event → failed with error', () => {
    const patch = reduceEvent(base, {
      kind: 'crawl:failed',
      error: { code: 'CRAWL_ALL_TRACKS_FAILED', message: 'no dice', retryable: false },
    });
    expect(patch.status).toBe('failed');
    expect(patch.error).toBeDefined();
  });
});
