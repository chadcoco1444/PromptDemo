/**
 * Pacing profiles — derived from the user's intent, injected into both the
 * system prompt (as soft + hard rules for Claude) and the Zod validator
 * (as a post-parse frame-budget check). Profile-aware validation triggers
 * the regular retry loop in generator.ts when Claude violates a hard cap.
 *
 * Three profiles for v2.1:
 *   - marketing_hype: fast cuts, mandatory TextPunch interleave
 *   - tutorial: slow & methodical, FeatureCallout-heavy
 *   - default: anything that doesn't match either keyword set
 *
 * Keyword detection is deliberately literal: we don't want the profile to
 * change subtly based on Claude's interpretation. The user types "tutorial"
 * → they get tutorial pacing.
 */

export type PacingProfile = 'marketing_hype' | 'tutorial' | 'default';

export interface PacingRules {
  profile: PacingProfile;
  /** Hard cap per scene (frames). Zod throws if any scene exceeds this. */
  maxSceneFrames: number | null;
  /** Hard floor per scene (frames). Zod throws if any scene is below this. */
  minSceneFrames: number | null;
  /** Text appended to the system prompt for this profile. */
  systemPromptAddition: string;
}

const HYPE_KEYWORDS = [
  'hype',
  'trailer',
  'promo',
  'launch',
  'announcement',
  'exciting',
  'energy',
  'sale',
  'limited',
  'high-energy',
  'high energy',
  'marketing',
  '行銷',
  '宣傳',
  '預告',
];

const TUTORIAL_KEYWORDS = [
  'tutorial',
  'how to',
  'how-to',
  'how do',
  'step by step',
  'step-by-step',
  'walkthrough',
  'walk-through',
  'walk through',
  'learn',
  'instructional',
  'guide',
  'getting started',
  'onboarding',
  '教學',
  '指南',
  '步驟',
];

export function detectPacingProfile(intent: string): PacingProfile {
  const lower = intent.toLowerCase();
  for (const k of HYPE_KEYWORDS) {
    if (lower.includes(k)) return 'marketing_hype';
  }
  for (const k of TUTORIAL_KEYWORDS) {
    if (lower.includes(k)) return 'tutorial';
  }
  return 'default';
}

const HYPE_RULES: PacingRules = {
  profile: 'marketing_hype',
  maxSceneFrames: 60,
  minSceneFrames: null,
  systemPromptAddition: [
    'CRITICAL: You are editing a high-energy trailer. Fast cuts only.',
    '- Every scene MUST be 60 frames (2 seconds) or less.',
    '- Interleave TextPunch scenes between every 1-2 feature scenes to keep the rhythm punchy.',
    '- Prefer short, declarative text. No paragraph-length descriptions.',
  ].join('\n'),
};

const TUTORIAL_RULES: PacingRules = {
  profile: 'tutorial',
  maxSceneFrames: null,
  minSceneFrames: 120,
  systemPromptAddition: [
    'CRITICAL: You are making an instructional video. Pacing must be methodical.',
    '- Every scene MUST be 120 frames (4 seconds) or longer.',
    '- Lean heavily on FeatureCallout — viewers need time to read each step.',
    '- Avoid TextPunch scenes; they break instructional flow.',
  ].join('\n'),
};

const DEFAULT_RULES: PacingRules = {
  profile: 'default',
  maxSceneFrames: null,
  minSceneFrames: null,
  systemPromptAddition: '',
};

export function getPacingRules(profile: PacingProfile): PacingRules {
  if (profile === 'marketing_hype') return HYPE_RULES;
  if (profile === 'tutorial') return TUTORIAL_RULES;
  return DEFAULT_RULES;
}
