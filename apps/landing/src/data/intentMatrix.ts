export type Intent = 'hardsell' | 'tech' | 'emotional';

export interface IntentMatrixCell {
  url: string;
  brandName: string;
  intent: Intent;
  intentLabel: string;
  intentEmoji: string;
  sceneSequence: string[];
  sceneCount: number;
  avgPaceSec: number;
  notes: string;
}

// Vercel cells: from docs/dev-notes/intent-spectrum-2026-04-28-supplement-1777342871972.md
//   (Day 2 9-cell verification, vercel + duolingo cells = 6/6 real-world success).
// Burton cells: extracted from the v1.6 showcase storyboards we generated on
//   2026-04-28 PM (jobs Z8NlUcwAXkbrwpmbRlJKV / nzXT4CIfOF1QefPnvCyQj /
//   THpg8QHCVc8qzowUafY-- — same MP4s rendered into apps/landing/public/showcase/).
//   Aligns matrix with the showcase above (both display vercel + burton).
// Duolingo cells previously here (commit before c64324a) — superseded by burton row
//   to match what visitors actually see playing in the showcase.
export const INTENT_MATRIX: IntentMatrixCell[] = [
  {
    url: 'https://vercel.com',
    brandName: 'Vercel',
    intent: 'hardsell',
    intentLabel: 'Hard-sell',
    intentEmoji: '🔥',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'TextPunch', 'CursorDemo', 'BentoGrid', 'TextPunch', 'CodeToUI', 'TextPunch', 'CTA'],
    sceneCount: 9,
    avgPaceSec: 3.3,
    notes: 'Punchy 9-scene cuts, 4× TextPunch interleaving for momentum',
  },
  {
    url: 'https://vercel.com',
    brandName: 'Vercel',
    intent: 'tech',
    intentLabel: 'Tech deep-dive',
    intentEmoji: '🔬',
    sceneSequence: ['DeviceMockup', 'TextPunch', 'FeatureCallout', 'CodeToUI', 'BentoGrid', 'TextPunch', 'CTA'],
    sceneCount: 7,
    avgPaceSec: 4.3,
    notes: 'Slower pacing, opens directly with product (no preamble)',
  },
  {
    url: 'https://vercel.com',
    brandName: 'Vercel',
    intent: 'emotional',
    intentLabel: 'Emotional brand',
    intentEmoji: '💫',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'TextPunch', 'SmoothScroll', 'CTA'],
    sceneCount: 5,
    avgPaceSec: 6.0,
    notes: 'Cinematic pacing, emphasis on aspiration over implementation',
  },
  {
    url: 'https://www.burton.com/',
    brandName: 'Burton',
    intent: 'hardsell',
    intentLabel: 'Hard-sell',
    intentEmoji: '🔥',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'TextPunch', 'FeatureCallout', 'TextPunch', 'BentoGrid', 'SmoothScroll', 'TextPunch', 'CTA'],
    sceneCount: 9,
    avgPaceSec: 3.3,
    notes: 'Same 9-scene cadence as vercel hardsell despite totally different industry — pacing pattern is intent-driven, not URL-driven',
  },
  {
    url: 'https://www.burton.com/',
    brandName: 'Burton',
    intent: 'tech',
    intentLabel: 'Tech deep-dive',
    intentEmoji: '🔬',
    sceneSequence: ['DeviceMockup', 'TextPunch', 'FeatureCallout', 'BentoGrid', 'SmoothScroll', 'CTA'],
    sceneCount: 6,
    avgPaceSec: 5.0,
    notes: 'Adds SmoothScroll (consumer ecommerce signal) vs vercel tech, otherwise similar feature-list shape',
  },
  {
    url: 'https://www.burton.com/',
    brandName: 'Burton',
    intent: 'emotional',
    intentLabel: 'Emotional brand',
    intentEmoji: '💫',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'TextPunch', 'SmoothScroll', 'TextPunch', 'CTA'],
    sceneCount: 6,
    avgPaceSec: 5.0,
    notes: 'TextPunch-heavy lifestyle build, slightly faster than vercel emotional (mountain energy vs serene infra)',
  },
];
