import type { Broker } from './sse/broker.js';
import type { JobStore } from './jobStore.js';
import type { Job } from './model/job.js';
import type { S3Uri } from '@lumespec/schema';

export async function fabricateJobTimeline(
  jobId: string,
  store: JobStore,
  broker: Broker
): Promise<void> {
  // Walk the job through stage events, driven synchronously so tests can
  // assert SSE fanout of 'progress' → 'done' via the broker.
  const push = async (patch: Partial<Job>, event: { event: string; data: unknown }) => {
    await store.patch(jobId, patch, Date.now());
    broker.publish(jobId, event);
  };

  await push(
    { status: 'crawling', stage: 'crawl', progress: 0 },
    { event: 'progress', data: { stage: 'crawl', pct: 0 } }
  );
  await push(
    { status: 'generating', stage: 'storyboard', progress: 0 },
    { event: 'progress', data: { stage: 'storyboard', pct: 0 } }
  );
  await push(
    { status: 'rendering', stage: 'render', progress: 0 },
    { event: 'progress', data: { stage: 'render', pct: 0 } }
  );
  const mockVideoUrl = 's3://lumespec-dev/mock/video.mp4' as S3Uri;
  await push(
    { status: 'done', progress: 100, videoUrl: mockVideoUrl },
    { event: 'done', data: { videoUrl: mockVideoUrl } }
  );
}
