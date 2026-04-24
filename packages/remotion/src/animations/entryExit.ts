import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { none } from '@remotion/transitions/none';

export const ANIMATION_ENUM = [
  'fade',
  'slideLeft',
  'slideRight',
  'slideUp',
  'zoomIn',
  'zoomOut',
  'none',
] as const;

export type Animation = (typeof ANIMATION_ENUM)[number];

export interface PresentationResult {
  component: unknown; // Remotion TransitionSeries.Transition.presentation expects a TransitionPresentation
  props: { durationInFrames?: number };
}

export function toPresentation(anim: Animation): PresentationResult {
  switch (anim) {
    case 'fade':
      return { component: fade(), props: {} };
    case 'slideLeft':
      return { component: slide({ direction: 'from-right' }), props: {} };
    case 'slideRight':
      return { component: slide({ direction: 'from-left' }), props: {} };
    case 'slideUp':
      return { component: slide({ direction: 'from-bottom' }), props: {} };
    case 'zoomIn':
      // Remotion's transitions package has no native zoom; approximate with fade until Plan 3.5
      return { component: fade(), props: {} };
    case 'zoomOut':
      return { component: fade(), props: {} };
    case 'none':
      return { component: none(), props: { durationInFrames: 0 } };
  }
}
