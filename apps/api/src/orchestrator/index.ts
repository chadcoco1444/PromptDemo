import type { QueueBundle } from '../queues.js';
import type { JobStore } from '../jobStore.js';
import type { Broker } from '../sse/broker.js';
import type { Job } from '../model/job.js';
import type { S3Uri } from '@promptdemo/schema';
import { isIntelPayload } from '@promptdemo/schema';
import { reduceEvent } from './stateMachine.js';
import { shouldDeferRender, renderQueueDepth, DEFAULT_RENDER_CAP } from './backpressure.js';

export interface OrchestratorConfig {
  queues: QueueBundle;
  store: JobStore;
  broker: Broker;
  renderCap?: number;
  now?: () => number;
  /**
   * Called when a job terminates in 'failed'. Receives the failed stage and
   * error code so the caller can decide on partial refunds per Amendment C.
   * Kept as a callback (not a pg.Pool) so orchestrator stays free of DB deps
   * and the refund tests can assert against a spy.
   */
  onJobFailed?: (args: {
    jobId: string;
    userId: string | undefined;
    stage: 'crawl' | 'storyboard' | 'render';
    errorCode: string;
    duration: 10 | 30 | 60;
  }) => Promise<void> | void;
}

// BullMQ 5.x QueueEvents delivers `returnvalue` as either a parsed object
// (when the worker's return was structured) or a JSON string (legacy / some
// transports). Accept both.
function parseReturn<T>(rv: unknown): T {
  if (typeof rv === 'string') return JSON.parse(rv) as T;
  return rv as T;
}

export async function startOrchestrator(cfg: OrchestratorConfig): Promise<() => Promise<void>> {
  const cap = cfg.renderCap ?? DEFAULT_RENDER_CAP;
  const now = cfg.now ?? Date.now;

  const applyPatch = async (jobId: string, patch: Partial<Job>) => {
    await cfg.store.patch(jobId, patch, now());
    const brokerEvent = patchToEvent(patch);
    if (brokerEvent) cfg.broker.publish(jobId, brokerEvent);
  };

  // BullMQ emits `progress` whenever a worker calls job.updateProgress(...).
  // Workers piggy-back intel payloads on that channel — we forward them to the
  // SSE broker without persisting to the job store (intel is ephemeral).
  const relayIntel = (ev: QueueBundle['crawlEvents']) => {
    ev.on('progress', ({ jobId, data }) => {
      if (!isIntelPayload(data)) return;
      cfg.broker.publish(jobId, { event: 'intel', data });
    });
  };
  relayIntel(cfg.queues.crawlEvents);
  relayIntel(cfg.queues.storyboardEvents);
  relayIntel(cfg.queues.renderEvents);

  cfg.queues.crawlEvents.on('active', async ({ jobId }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    await applyPatch(jobId, reduceEvent(current, { kind: 'crawl:active' }));
  });

  cfg.queues.crawlEvents.on('completed', async ({ jobId, returnvalue }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    const parsed = parseReturn<{ crawlResultUri: S3Uri }>(returnvalue);
    await applyPatch(jobId, reduceEvent(current, { kind: 'crawl:completed', crawlResultUri: parsed.crawlResultUri }));
    await cfg.queues.storyboard.add(
      'generate',
      {
        jobId,
        crawlResultUri: parsed.crawlResultUri,
        intent: current.input.intent,
        duration: current.input.duration,
        ...(current.input.hint ? { hint: current.input.hint } : {}),
      },
      { jobId } // pin BullMQ jobId = app jobId so downstream QueueEvents hand us the right id
    );
  });

  cfg.queues.crawlEvents.on('failed', async ({ jobId, failedReason }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    await applyPatch(
      jobId,
      reduceEvent(current, {
        kind: 'crawl:failed',
        error: { code: 'CRAWL_FAILED', message: failedReason ?? 'unknown', retryable: false },
      })
    );
    if (cfg.onJobFailed) {
      await cfg.onJobFailed({
        jobId,
        userId: current.userId,
        stage: 'crawl',
        errorCode: 'CRAWL_FAILED',
        duration: current.input.duration,
      });
    }
  });

  cfg.queues.storyboardEvents.on('completed', async ({ jobId, returnvalue }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    const parsed = parseReturn<{ storyboardUri: S3Uri }>(returnvalue);
    const depth = await renderQueueDepth(cfg.queues.render);
    const defer = shouldDeferRender({ active: depth.active, cap });
    await applyPatch(
      jobId,
      reduceEvent(current, {
        kind: 'storyboard:completed',
        storyboardUri: parsed.storyboardUri,
        canRender: !defer,
      })
    );
    await cfg.queues.render.add(
      'render',
      {
        jobId,
        storyboardUri: parsed.storyboardUri,
        sourceUrl: current.input.url,
        duration: current.input.duration,
      },
      { jobId }
    );
    if (defer) {
      cfg.broker.publish(jobId, {
        event: 'queued',
        data: { position: depth.waiting + 1, aheadOfYou: depth.waiting },
      });
    }
  });

  cfg.queues.storyboardEvents.on('failed', async ({ jobId, failedReason }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    await applyPatch(
      jobId,
      reduceEvent(current, {
        kind: 'storyboard:failed',
        error: { code: 'STORYBOARD_GEN_FAILED', message: failedReason ?? 'unknown', retryable: false },
      })
    );
    if (cfg.onJobFailed) {
      await cfg.onJobFailed({
        jobId,
        userId: current.userId,
        stage: 'storyboard',
        errorCode: 'STORYBOARD_GEN_FAILED',
        duration: current.input.duration,
      });
    }
  });

  cfg.queues.renderEvents.on('active', async ({ jobId }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    await applyPatch(jobId, reduceEvent(current, { kind: 'render:active' }));
  });

  cfg.queues.renderEvents.on('completed', async ({ jobId, returnvalue }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    const parsed = parseReturn<{ videoUrl: S3Uri; thumbUrl?: S3Uri }>(returnvalue);
    const patch = reduceEvent(current, { kind: 'render:completed', videoUrl: parsed.videoUrl });
    if (parsed.thumbUrl) {
      patch.thumbUrl = parsed.thumbUrl;
    }
    await applyPatch(jobId, patch);
  });

  cfg.queues.renderEvents.on('failed', async ({ jobId, failedReason }) => {
    const current = await cfg.store.get(jobId);
    if (!current) return;
    await applyPatch(
      jobId,
      reduceEvent(current, {
        kind: 'render:failed',
        error: { code: 'RENDER_FAILED', message: failedReason ?? 'unknown', retryable: false },
      })
    );
    if (cfg.onJobFailed) {
      await cfg.onJobFailed({
        jobId,
        userId: current.userId,
        stage: 'render',
        errorCode: 'RENDER_FAILED',
        duration: current.input.duration,
      });
    }
  });

  return async () => {
    // QueueEvents close in queues.closeQueueBundle — nothing specific to do here.
  };
}

function patchToEvent(patch: Partial<Job>): { event: string; data: unknown } | null {
  if (patch.status === 'done' && patch.videoUrl) {
    return { event: 'done', data: { videoUrl: patch.videoUrl } };
  }
  if (patch.status === 'failed' && patch.error) {
    return { event: 'error', data: patch.error };
  }
  if (patch.stage) {
    return { event: 'progress', data: { stage: patch.stage, pct: patch.progress ?? 0 } };
  }
  return null;
}
