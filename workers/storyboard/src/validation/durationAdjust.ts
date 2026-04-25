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

// 15% tolerance: up to this drift gets silently prorated. Widened from 10%
// because pacing profiles (tutorial min=120, marketing_hype max=60) make
// Claude balance more constraints simultaneously, and a few percent of total
// drift on top of profile compliance is normal. Uniform proportional
// rescaling at this range stays visually imperceptible. Over 15% typically
// means Claude duplicated a scene or mis-planned significantly.
const TOLERANCE = 0.15;

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
