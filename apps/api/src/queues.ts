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

export function makeQueueBundle(connection: Redis): QueueBundle {
  const opts = { connection: connection as any };
  return {
    crawl: new Queue('crawl', opts),
    storyboard: new Queue('storyboard', opts),
    render: new Queue('render', opts),
    crawlEvents: new QueueEvents('crawl', opts),
    storyboardEvents: new QueueEvents('storyboard', opts),
    renderEvents: new QueueEvents('render', opts),
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
