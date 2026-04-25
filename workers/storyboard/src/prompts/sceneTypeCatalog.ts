import { SCENE_TYPES } from '@promptdemo/schema';

export const SCENE_CATALOG: Record<(typeof SCENE_TYPES)[number], string> = {
  HeroRealShot:
    'Opening scene with a real screenshot + overlaid title/subtitle. Props: { title, subtitle?, screenshotKey: "viewport"|"fullPage" }. Use only when assets.screenshots.viewport or fullPage exists.',
  HeroStylized:
    'Opening scene with a stylized re-draw (no screenshot). Props: { title, subtitle? }. Use when assets.screenshots is empty (Tier B fallback).',
  FeatureCallout:
    'Single feature focus. Props: { title, description, layout: "leftImage"|"rightImage"|"topDown", iconHint? }. The core building block of the middle section.',
  CursorDemo:
    "Simulated cursor interaction. Props: { action: \"Click\"|\"Scroll\"|\"Hover\"|\"Type\", targetHint: { region: \"top-left\"|\"top\"|\"top-right\"|\"left\"|\"center\"|\"right\"|\"bottom-left\"|\"bottom\"|\"bottom-right\" }, targetDescription }. Not allowed in 10s videos.",
  SmoothScroll:
    'Long-page scroll showcase. Props: { screenshotKey: "fullPage", speed: "slow"|"medium"|"fast" }. Requires assets.screenshots.fullPage.',
  UseCaseStory:
    'Three-beat narrative. Props: { beats: [{label:"before",text}, {label:"action",text}, {label:"after",text}] }. Only for 60s videos.',
  StatsBand:
    'Numeric callout band. Props: { stats: [{value, label}] (1-4 items) }. Use only if sourceTexts contain numeric phrases.',
  BentoGrid:
    "Dense feature grid (3-6 items) — shows multiple features in one scene instead of separate FeatureCallouts. Props: { items: [{title, description?, iconHint? (one emoji character, e.g. \"📊\", \"💬\", \"🎨\" — NOT an icon library name like \"database\")}] }. Ideal for 30s/60s videos when 3+ small features would otherwise create scene bloat.",
  TextPunch:
    'Full-screen text beat for pacing. Props: { text, emphasis: "primary"|"secondary"|"neutral" }. Use to break up rhythm between feature scenes.',
  CTA:
    'Closing scene. Props: { headline, url }. Always required as the last scene.',
};

export const V1_IMPLEMENTED_SCENE_TYPES = [
  'HeroRealShot',
  'FeatureCallout',
  'TextPunch',
  'SmoothScroll',
  'CTA',
  'BentoGrid',
  'CursorDemo',
] as const;

/**
 * The exact slice of SCENE_CATALOG that's actually wired through to
 * Remotion. We hand-assemble the prompt fragment from this so the system
 * prompt cannot accidentally leak unimplemented scene types — Claude
 * confidently emits them otherwise (CursorDemo, BentoGrid, UseCaseStory,
 * StatsBand, HeroStylized).
 *
 * This is the ONLY place the catalog is filtered for prompt purposes.
 * Anyone adding a new V1_IMPLEMENTED scene only updates the array above
 * and AVAILABLE_SCENES_PROMPT regenerates automatically.
 */
export const AVAILABLE_SCENES_PROMPT: string = V1_IMPLEMENTED_SCENE_TYPES.map(
  (type) => `  - ${type}: ${SCENE_CATALOG[type]}`,
).join('\n');
