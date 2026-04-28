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

// Data sourced from docs/dev-notes/intent-spectrum-2026-04-28-supplement-1777342871972.md
// (Day 2 9-cell verification, vercel + duolingo cells = 6/6 real-world success).
// Burton row deferred until Anthropic credit re-tops + remaining 2 cells re-run.
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
    url: 'https://www.duolingo.com',
    brandName: 'Duolingo',
    intent: 'hardsell',
    intentLabel: 'Hard-sell',
    intentEmoji: '🔥',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'TextPunch', 'BentoGrid', 'TextPunch', 'SmoothScroll', 'TextPunch', 'CTA'],
    sceneCount: 8,
    avgPaceSec: 3.8,
    notes: 'SmoothScroll appears (consumer-app coded) — 4× TextPunch chain',
  },
  {
    url: 'https://www.duolingo.com',
    brandName: 'Duolingo',
    intent: 'tech',
    intentLabel: 'Tech deep-dive',
    intentEmoji: '🔬',
    sceneSequence: ['DeviceMockup', 'TextPunch', 'BentoGrid', 'TextPunch', 'CTA'],
    sceneCount: 5,
    avgPaceSec: 6.0,
    notes: 'Minimal scene set, longest avg pace — methodical walkthrough',
  },
  {
    url: 'https://www.duolingo.com',
    brandName: 'Duolingo',
    intent: 'emotional',
    intentLabel: 'Emotional brand',
    intentEmoji: '💫',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'TextPunch', 'BentoGrid', 'CTA'],
    sceneCount: 5,
    avgPaceSec: 6.0,
    notes: 'Opens with TextPunch hook (lifestyle aspiration before product reveal)',
  },
];
