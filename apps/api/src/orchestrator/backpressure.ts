import type { Queue } from 'bullmq';

export const DEFAULT_RENDER_CAP = 20;

export function shouldDeferRender(args: { active: number; cap: number }): boolean {
  return args.active >= args.cap;
}

export async function renderQueueDepth(render: Queue): Promise<{ active: number; waiting: number }> {
  const counts = await render.getJobCounts('active', 'waiting');
  return { active: counts.active ?? 0, waiting: counts.waiting ?? 0 };
}
