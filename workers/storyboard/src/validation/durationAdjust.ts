import type { Storyboard } from '@lumespec/schema';
import { rescaleFrames } from '../rescaleFrames.js';

type MinimalScene = { durationInFrames: number };
type MinimalBoard = {
  videoConfig: { durationInFrames: number };
  scenes: MinimalScene[];
};

export type AdjustResult<T extends MinimalBoard> =
  | { kind: 'ok'; storyboard: T }
  | { kind: 'retry'; reason: string; sum: number; target: number };

export function adjustDuration<T extends MinimalBoard>(sb: T): AdjustResult<T> {
  const target = sb.videoConfig.durationInFrames;
  const sum = sb.scenes.reduce((a, s) => a + s.durationInFrames, 0);
  if (sum === target) return { kind: 'ok', storyboard: sb };

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
