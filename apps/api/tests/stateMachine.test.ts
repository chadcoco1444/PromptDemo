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
    const job = { ...base, status: 'queued' as const };
    const patch = reduceEvent(job, { kind: 'crawl:active' });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('crawling');
    expect(patch!.stage).toBe('crawl');
    expect(patch!.progress).toBe(0);
  });

  it('crawl done → generating stage with URI stored', () => {
    const job = { ...base, status: 'crawling' as const };
    const patch = reduceEvent(job, {
      kind: 'crawl:completed',
      crawlResultUri: 's3://b/k/crawl.json' as any,
    });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('generating');
    expect(patch!.stage).toBe('storyboard');
    expect(patch!.crawlResultUri).toBe('s3://b/k/crawl.json');
  });

  it('storyboard done + render has capacity → rendering', () => {
    const job = { ...base, status: 'generating' as const };
    const patch = reduceEvent(job, {
      kind: 'storyboard:completed',
      storyboardUri: 's3://b/k/sb.json' as any,
      canRender: true,
    });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('rendering');
    expect(patch!.stage).toBe('render');
    expect(patch!.storyboardUri).toBe('s3://b/k/sb.json');
  });

  it('storyboard done + render full → waiting_render_slot', () => {
    const job = { ...base, status: 'generating' as const };
    const patch = reduceEvent(job, {
      kind: 'storyboard:completed',
      storyboardUri: 's3://b/k/sb.json' as any,
      canRender: false,
    });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('waiting_render_slot');
    expect(patch!.stage).toBe('render');
  });

  it('render done → done with videoUrl', () => {
    const job = { ...base, status: 'rendering' as const };
    const patch = reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('done');
    expect(patch!.videoUrl).toBe('s3://b/k/v.mp4');
    expect(patch!.progress).toBe(100);
  });

  it('any failed event → failed with error', () => {
    const job = { ...base, status: 'crawling' as const };
    const patch = reduceEvent(job, {
      kind: 'crawl:failed',
      error: { code: 'CRAWL_ALL_TRACKS_FAILED', message: 'no dice', retryable: false },
    });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('failed');
    expect(patch!.error).toBeDefined();
  });
});

describe('reduceEvent — transition guard (new)', () => {
  it('returns null for any event when status is done (terminal)', () => {
    const job = { ...base, status: 'done' as const };
    expect(reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any })).toBeNull();
    expect(reduceEvent(job, { kind: 'render:failed', error: { code: 'E', message: 'm', retryable: false } })).toBeNull();
    expect(reduceEvent(job, { kind: 'crawl:active' })).toBeNull();
  });

  it('returns null for any event when status is failed (terminal)', () => {
    const job = { ...base, status: 'failed' as const };
    expect(reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any })).toBeNull();
    expect(reduceEvent(job, { kind: 'crawl:active' })).toBeNull();
  });

  it('returns null for wrong-stage event (render:completed while generating)', () => {
    const job = { ...base, status: 'generating' as const };
    expect(reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any })).toBeNull();
  });

  it('returns null for wrong-stage event (crawl:active while rendering)', () => {
    const job = { ...base, status: 'rendering' as const };
    expect(reduceEvent(job, { kind: 'crawl:active' })).toBeNull();
  });

  it('returns patch for valid transition: queued → crawl:active', () => {
    const job = { ...base, status: 'queued' as const };
    const patch = reduceEvent(job, { kind: 'crawl:active' });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('crawling');
  });

  it('returns patch for valid transition: rendering → render:completed', () => {
    const job = { ...base, status: 'rendering' as const };
    const patch = reduceEvent(job, { kind: 'render:completed', videoUrl: 's3://b/k/v.mp4' as any });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('done');
  });

  it('returns patch for valid transition: waiting_render_slot → render:active', () => {
    const job = { ...base, status: 'waiting_render_slot' as const };
    const patch = reduceEvent(job, { kind: 'render:active' });
    expect(patch).not.toBeNull();
    expect(patch!.status).toBe('rendering');
  });
});
