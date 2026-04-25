import { z } from 'zod';

/**
 * Live-intel frames: short, human-readable status messages that workers
 * stream to the client while a stage is executing. Piggy-backs on BullMQ's
 * `Job.updateProgress(...)` channel — workers emit objects of this shape,
 * the orchestrator listens on QueueEvents `progress` and fans them out to
 * the SSE broker as `intel` events.
 *
 * Keep messages short (under ~60 chars). They render as a fading subtitle
 * under the progress bar; users read them, they don't study them.
 */
export const IntelStageSchema = z.enum(['crawl', 'storyboard', 'render']);
export type IntelStage = z.infer<typeof IntelStageSchema>;

export const IntelPayloadSchema = z.object({
  kind: z.literal('intel'),
  stage: IntelStageSchema,
  message: z.string().min(1).max(200),
  ts: z.number().int().positive(),
});
export type IntelPayload = z.infer<typeof IntelPayloadSchema>;

export function makeIntel(stage: IntelStage, message: string): IntelPayload {
  return { kind: 'intel', stage, message, ts: Date.now() };
}

/**
 * Type-narrowing guard used by the orchestrator when it receives a BullMQ
 * `progress` event — the payload could be a plain numeric progress percent
 * (default BullMQ behavior) or an intel object.
 */
export function isIntelPayload(value: unknown): value is IntelPayload {
  return IntelPayloadSchema.safeParse(value).success;
}
