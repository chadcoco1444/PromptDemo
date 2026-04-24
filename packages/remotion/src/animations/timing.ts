import { linearTiming } from '@remotion/transitions';

export function defaultTransitionTiming(durationInFrames: number) {
  return linearTiming({ durationInFrames });
}
