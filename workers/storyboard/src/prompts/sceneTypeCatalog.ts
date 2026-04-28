import { SCENE_TYPES } from '@lumespec/schema';

export const SCENE_CATALOG: Record<(typeof SCENE_TYPES)[number], string> = {
  HeroRealShot:
    'Opening scene with a real screenshot + overlaid title/subtitle. Props: { title, subtitle?, screenshotKey: "viewport"|"fullPage" }. Use only when assets.screenshots.viewport or fullPage exists.',
  HeroStylized:
    'Opening scene with a stylized re-draw (no screenshot). Props: { title, subtitle? }. Use when assets.screenshots is empty (Tier B fallback).',
  FeatureCallout:
    'Single feature focus. Props: { title, description, layout: "leftImage"|"rightImage"|"topDown", iconHint? }. Use sparingly — two back-to-back is acceptable, three or more in a row is a signal to use BentoGrid instead.',
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
    'Full-screen text beat for pacing. Props: { text, emphasis: "primary"|"secondary"|"neutral", variant?: "default"|"photoBackdrop"|"slideBlock" — default "default" }. Use to break up rhythm between feature scenes. Visual variants: "default" = solid color block (legacy), "photoBackdrop" = source-page screenshot background with dark overlay, "slideBlock" = colored block slides in/out horizontally. When using TextPunch more than once in a storyboard, alternate variants for visual variety. For dramatic single-line customer voice, use QuoteHero instead.',
  QuoteHero:
    'Single cinematic pull-quote with author attribution — visually richer alternative to TextPunch for "one dramatic line of customer voice" moments. Props: { quote (10-280 chars, must be substring of sourceTexts), author (must appear in sourceTexts), attribution? (role + company, also from sourceTexts), backgroundHint?: "gradient" | "screenshot" }. **HARD GATE: only use if sourceTexts contains BOTH (a) a quotable sentence ≥40 chars AND (b) a person name (recognizable as First+Last or @handle). If either is missing, DO NOT use QuoteHero — pick TextPunch (with non-default variant) or skip the scene.** Discrimination from ReviewMarquee: 1 dramatic quote → QuoteHero, 3+ short endorsements → ReviewMarquee.',
  VersusSplit:
    'Side-by-side comparison scene — left vs right with strong visual contrast. Props: { headline?, compareFraming: "before-after"|"them-us"|"old-new"|"slow-fast", left: { label (UI framing, e.g. "Before"), value (must be substring of sourceTexts), iconHint? (1 emoji) }, right: { label, value (must be substring of sourceTexts), iconHint? } }. **HARD GATE: only use if you can identify TWO distinct sourceText entries that semantically contrast (numbers comparing the same metric, capability before/after, market positioning vs alternative). If you can\'t point to BOTH source phrases verbatim, DO NOT use VersusSplit — fabricating just one side breaks the contract. Pick FeatureCallout or BentoGrid instead.** Strongest for hardsell + tech intents.',
  CTA:
    'Closing scene. Props: { headline, url }. Always required as the last scene.',
  StatsCounter:
    'Animated numeric counters that roll from zero to the target value. Props: { stats: [{value, label}] (1-4 items) }. ONLY use if sourceTexts contain at least one numeric phrase (e.g. "10× faster", "99.9% uptime", "1 million users"). Do NOT invent numbers — only use figures already present in sourceTexts. Fails gracefully when no valid numbers are supplied.',
  ReviewMarquee:
    'Horizontally scrolling testimonial ticker with fade-mask edges. Props: { reviews: [{text, author?}] (2-6 items), speed: "slow"|"medium"|"fast" }. **HARD GATE: ONLY use when `crawlResult.reviews` array contains ≥2 entries with .text ≥40 chars each. DO NOT synthesize reviews from sourceTexts fragments (e.g. company-name snippets like "Acme partners with us" are NOT testimonials — they are partnership announcements). If `crawlResult.reviews.length < 2`, this scene is FORBIDDEN — pick BentoGrid or LogoCloud instead.** Pull review text verbatim from `crawlResult.reviews[].text`. Not recommended for 10s videos.',
  LogoCloud:
    'Horizontally scrolling partner/integration logo strip. Props: { logos: [{name, s3Uri}] (2-12 items from crawlResult.logos), speed: "slow"|"medium"|"fast", label? (optional section heading, e.g. "Trusted by 1,000+ teams") }. ONLY use when crawlResult.logos contains at least 2 entries. Pull logos verbatim from crawlResult.logos.',
  CodeToUI:
    'Split-screen: code typewriter on left, product screenshot reveal on right. Props: { code (verbatim from crawlResult.codeSnippets[n].code), language?, label?, screenshotKey: "viewport"|"fullPage" }. ONLY use when crawlResult.codeSnippets is non-empty AND assets.screenshots.viewport exists. Best for SaaS/dev-tool products.',
  DeviceMockup:
    'Premium dark laptop shell wrapping a hero screenshot with cinematic Pan/Zoom motion and a STATIC headline below. PREFERRED OPENER for SaaS / web-app products — use as scenes[0] whenever assets.screenshots.viewport is non-empty. Props: { headline, subtitle?, screenshotKey: "viewport" (only), device: "laptop" (only — "phone" exists in schema but is NOT yet rendered), motion: "pushIn" (focus / hook energy) | "pullOut" (reveal / build energy) }. Fall back to HeroRealShot only when the viewport screenshot is unsuitable (mostly white, no visual hierarchy, or absent).',
};

export const V1_IMPLEMENTED_SCENE_TYPES = [
  'DeviceMockup',
  'HeroRealShot',
  'FeatureCallout',
  'TextPunch',
  'QuoteHero',
  'VersusSplit',
  'SmoothScroll',
  'CTA',
  'BentoGrid',
  'CursorDemo',
  'StatsCounter',
  'ReviewMarquee',
  'LogoCloud',
  'CodeToUI',
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
