import { Queue, QueueEvents } from 'bullmq';
import type { Redis } from 'ioredis';

export interface QueueBundle {
  crawl: Queue;
  storyboard: Queue;
  render: Queue;
  crawlEvents: QueueEvents;
  storyboardEvents: QueueEvents;
  renderEvents: QueueEvents;
}

export const JOB_DEFAULTS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 5_000, // 5s → 10s → 20s
  },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
} as const;

export function makeQueueBundle(connection: Redis): QueueBundle {
  const opts = { connection: connection as any, defaultJobOptions: JOB_DEFAULTS };
  return {
    crawl: new Queue('crawl', opts),
    storyboard: new Queue('storyboard', opts),
    render: new Queue('render', opts),
    crawlEvents: new QueueEvents('crawl', { connection: connection as any }),
    storyboardEvents: new QueueEvents('storyboard', { connection: connection as any }),
    renderEvents: new QueueEvents('render', { connection: connection as any }),
  };
}

export async function closeQueueBundle(b: QueueBundle): Promise<void> {
  await Promise.all([
    b.crawl.close(),
    b.storyboard.close(),
    b.render.close(),
    b.crawlEvents.close(),
    b.storyboardEvents.close(),
    b.renderEvents.close(),
  ]);
}
