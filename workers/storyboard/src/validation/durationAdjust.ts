import type { Storyboard } from '@promptdemo/schema';
import { rescaleFrames } from '../rescaleFrames.js';

type MinimalScene = { durationInFrames: number };
type MinimalBoard = {
  videoConfig: { durationInFrames: number };
  scenes: MinimalScene[];
};

export type AdjustResult<T extends MinimalBoard> =
  | { kind: 'ok'; storyboard: T }
  | { kind: 'retry'; reason: string; sum: number; target: number };

// 10% tolerance: up to this drift gets silently prorated so users never see
// STORYBOARD_GEN_FAILED for mild Claude math errors. Wider than the previous
// 5% because Claude routinely drifts 5-9% on 60s videos and the proration is
// visually imperceptible at that range (uniform scene compression). Over 10%
// typically means Claude duplicated a scene or mis-planned significantly, so
// a retry with feedback is better than silently compressing by 15%+.
const TOLERANCE = 0.10;

export function adjustDuration<T extends MinimalBoard>(sb: T): AdjustResult<T> {
  const target = sb.videoConfig.durationInFrames;
  const sum = sb.scenes.reduce((a, s) => a + s.durationInFrames, 0);
  if (sum === target) return { kind: 'ok', storyboard: sb };

  const pctOff = Math.abs(sum - target) / target;
  if (pctOff > TOLERANCE) {
    return {
      kind: 'retry',
      reason: `scenes sum ${sum} differs from target ${target} by ${(pctOff * 100).toFixed(1)}%, which exceeds the ${(TOLERANCE * 100).toFixed(0)}% auto-correct tolerance`,
      sum,
      target,
    };
  }

  const newDurations = rescaleFrames(
    sb.scenes.map((s) => s.durationInFrames),
    target
  );
  const scenes = sb.scenes.map((s, i) => ({ ...s, durationInFrames: newDurations[i]! }));
  return { kind: 'ok', storyboard: { ...sb, scenes } };
}

// Storyboard-typed convenience wrapper
export function adjustStoryboardDuration(sb: Storyboard): AdjustResult<Storyboard> {
  return adjustDuration(sb);
}
