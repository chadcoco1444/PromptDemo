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

// Vercel + Burton cells: extracted from the v1.7 re-render storyboards
//   on 2026-04-28 PM (jobs FmOSZiFo… / yGUcUw… / RkSXwf… for vercel,
//   XnqueLM… / Ik3h3A4… / ZTl45xeS… for burton).
//   Re-rendered after v1.7 SCENE PACING DISCIPLINE shipped — TextPunch
//   counts dropped from 4× per video (v1.6) to ≤2 with non-default variants
//   alternated. Numbers below reflect post-discipline reality matching
//   what visitors actually see in the showcase MP4s above.
export const INTENT_MATRIX: IntentMatrixCell[] = [
  {
    url: 'https://vercel.com',
    brandName: 'Vercel',
    intent: 'hardsell',
    intentLabel: 'Hard-sell',
    intentEmoji: '🔥',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'BentoGrid', 'CodeToUI', 'FeatureCallout', 'TextPunch', 'CursorDemo', 'CTA'],
    sceneCount: 8,
    avgPaceSec: 3.8,
    notes: 'Tighter cadence post-v1.7 — 2× TextPunch (was 4×) with photoBackdrop+slideBlock variants alternating',
  },
  {
    url: 'https://vercel.com',
    brandName: 'Vercel',
    intent: 'tech',
    intentLabel: 'Tech deep-dive',
    intentEmoji: '🔬',
    sceneSequence: ['DeviceMockup', 'TextPunch', 'CodeToUI', 'BentoGrid', 'TextPunch', 'CTA'],
    sceneCount: 6,
    avgPaceSec: 5.0,
    notes: 'CodeToUI + BentoGrid carry the technical density; TextPunch reserved for transition beats',
  },
  {
    url: 'https://vercel.com',
    brandName: 'Vercel',
    intent: 'emotional',
    intentLabel: 'Emotional brand',
    intentEmoji: '💫',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'CodeToUI', 'BentoGrid', 'CTA'],
    sceneCount: 5,
    avgPaceSec: 6.0,
    notes: 'Slowest pacing of the 3 vercel intents — single TextPunch hook, then product-forward sequence',
  },
  {
    url: 'https://www.burton.com/',
    brandName: 'Burton',
    intent: 'hardsell',
    intentLabel: 'Hard-sell',
    intentEmoji: '🔥',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'FeatureCallout', 'BentoGrid', 'TextPunch', 'SmoothScroll', 'CTA'],
    sceneCount: 7,
    avgPaceSec: 4.3,
    notes: 'Energy via SmoothScroll + 2× variant-alternated TextPunch — same intent, completely different industry vs vercel',
  },
  {
    url: 'https://www.burton.com/',
    brandName: 'Burton',
    intent: 'tech',
    intentLabel: 'Tech deep-dive',
    intentEmoji: '🔬',
    sceneSequence: ['DeviceMockup', 'TextPunch', 'BentoGrid', 'SmoothScroll', 'TextPunch', 'CTA'],
    sceneCount: 6,
    avgPaceSec: 5.0,
    notes: 'Same shape as vercel tech but BentoGrid carries product specs, SmoothScroll for product line breadth',
  },
  {
    url: 'https://www.burton.com/',
    brandName: 'Burton',
    intent: 'emotional',
    intentLabel: 'Emotional brand',
    intentEmoji: '💫',
    sceneSequence: ['TextPunch', 'DeviceMockup', 'FeatureCallout', 'SmoothScroll', 'TextPunch', 'CTA'],
    sceneCount: 6,
    avgPaceSec: 5.0,
    notes: 'TextPunch lifestyle hook + FeatureCallout for storytelling beats + SmoothScroll for atmosphere',
  },
];
