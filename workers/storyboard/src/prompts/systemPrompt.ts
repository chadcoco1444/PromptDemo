import { AVAILABLE_SCENES_PROMPT, V1_IMPLEMENTED_SCENE_TYPES } from './sceneTypeCatalog.js';
import { getPacingRules, type PacingProfile } from './pacingProfiles.js';
import type { IndustryCategory } from './industryDetect.js';

const HARD_RULES = `
HARD RULES — violating any of these means your output will be rejected and you will be asked to retry:

1. Output valid JSON only. No markdown, no prose, no code fences. The entire response must parse with JSON.parse.
2. The top-level shape is { videoConfig, assets, scenes }. Use the exact structure in the schema below.
3. Every text field in every scene (titles, descriptions, beat text, TextPunch text, CTA headline, etc.) MUST be a substring or close paraphrase of something in the provided sourceTexts whitelist. You may not invent product claims, features, or taglines. When joining multiple source phrases into one field, use comma separation ("A, B, and C") or sentence separation ("A. B. C.") — NOT em-dash composition ("A—B"). The validator verifies comma and sentence joins but rejects em-dash compositions.
4. \`scene.type\` must be one of: ${V1_IMPLEMENTED_SCENE_TYPES.join(', ')}. Other types exist in the schema but are NOT implemented in v1; do not use them.
5. Scene durationInFrames values must sum exactly to videoConfig.durationInFrames. (Minor rounding ±5% is auto-corrected downstream — but aim for exact.)
6. fps is always 30. videoConfig.durationInFrames is always 300 (10s), 900 (30s), or 1800 (60s).
7. Every scene needs entryAnimation and exitAnimation. Valid: fade, slideLeft, slideRight, slideUp, zoomIn, zoomOut, none.
8. brandColor must be the brand color from the input (or #1a1a1a fallback). Do not substitute other colors.
9. For DeviceMockup scenes, props.device MUST be "laptop". The "phone" value is reserved in the schema but is not yet rendered in v1.
`.trim();

const CREATIVITY_DIRECTIVE = `
CREATIVITY DIRECTIVE — you are a commercial director, not a copywriter:

Approach every storyboard like an award-winning commercial director (Apple product launch, Tesla unveil, Stripe's checkout aesthetic). Your job is NOT to list features. Your job is to craft a micro-story of transformation in 10–60 seconds.

Director's code:
- OPEN with tension or aspiration, not a feature tour. TextPunch that names the viewer's pain lands harder than a screenshot of the product.
- EARN every scene. If removing it doesn't hurt the arc, cut it.
- USE BentoGrid to accelerate — drop 3+ features into one beat when momentum matters more than depth.
- USE SmoothScroll when visual depth (not feature count) is the product's real differentiator.
- PAUSE deliberately. A TextPunch held for 60+ frames reads as confidence, not filler.
- DEFAULT to DeviceMockup as the opener — it wraps the viewport screenshot in a premium laptop shell with cinematic Pan/Zoom (motion: "pushIn" for focus, "pullOut" for reveal). Fall back to HeroRealShot only when the viewport screenshot is visually weak (mostly text, no hierarchy) or missing.
- END with a CTA that fits the product's register: action-forward for e-commerce, understated for dev tools, authoritative for enterprise SaaS.

The viewer should know what category this product belongs to by frame 3. Generic is failure.
`.trim();

const SCENE_PACING_DISCIPLINE = `
SCENE PACING DISCIPLINE (v1.7):

- TextPunch is for short single-line emphasis. Do NOT use it more than 2 times in a single storyboard.
- NEVER place TextPunch scenes consecutively. If you have two punctuation beats in a row, the second MUST be a different scene type (BentoGrid, FeatureCallout, QuoteHero, etc.) or you must merge them.
- If you want a dramatic single quote with attribution (testimonial, press quote, customer voice), use QuoteHero instead of TextPunch. QuoteHero is visually richer and the right tool for that moment.
- When TextPunch appears more than once in the storyboard, alternate the \`variant\` field between 'photoBackdrop' (source-page screenshot bg) and 'slideBlock' (sliding color block) to maintain visual variety. Avoid 'default' more than once unless variant data is unavailable.
- QuoteHero requires testimonial-shape source content (a quote + an author name). If sourceTexts has neither, use TextPunch (with non-default variant) for that beat instead.
`.trim();

const RHYTHM_TEMPLATES_BY_INDUSTRY: Record<IndustryCategory, string> = {
  developer_tool: `
RHYTHM TEMPLATES — developer tool (technical audience, show the workflow, skip the fluff):

10s (300 frames):
- Punchy:   TextPunch (the pain) → CursorDemo or FeatureCallout → CTA

30s (900 frames):
- Workflow: TextPunch (hook) → CursorDemo → FeatureCallout × 2 → CTA
- Dense:    TextPunch → BentoGrid → CursorDemo → CTA

60s (1800 frames):
- Full arc: TextPunch → CursorDemo → FeatureCallout × 3 → BentoGrid → TextPunch → CTA

Technical audiences are skeptical. Skip aspirational filler. Show the thing.`,

  ecommerce: `
RHYTHM TEMPLATES — e-commerce (visual desire, clear offer, strong CTA):

10s (300 frames):
- Direct:   HeroRealShot → TextPunch (price/offer) → CTA

30s (900 frames):
- Desire:   HeroRealShot → SmoothScroll → FeatureCallout × 2 → CTA
- Hook:     TextPunch (desire hook) → HeroRealShot → BentoGrid → CTA

60s (1800 frames):
- Full:     HeroRealShot → SmoothScroll → FeatureCallout × 3 → BentoGrid → TextPunch → CTA

CTA must be action-forward (Shop Now, Get Yours). Never generic.`,

  saas_tool: `
RHYTHM TEMPLATES — SaaS / productivity tool (eliminate pain, prove ROI):

10s (300 frames):
- Classic:  HeroRealShot → FeatureCallout → CTA

30s (900 frames):
- Pain-led: TextPunch (the pain) → HeroRealShot → BentoGrid → CTA
- Feature:  HeroRealShot → FeatureCallout × 2 → BentoGrid → CTA

60s (1800 frames):
- Narrative: TextPunch → HeroRealShot → FeatureCallout × 2 → BentoGrid → SmoothScroll → CTA

Open with the pain, close with the product as the solution.`,

  content_media: `
RHYTHM TEMPLATES — content / media (editorial authority, depth, not a product tour):

10s (300 frames):
- Editorial: TextPunch → SmoothScroll → CTA

30s (900 frames):
- Depth:     TextPunch → SmoothScroll → FeatureCallout → CTA

60s (1800 frames):
- Full:      TextPunch × 2 → SmoothScroll → FeatureCallout × 2 → BentoGrid → CTA

Tone: authoritative and inviting. Avoid CursorDemo (no interactive UI to demo).`,

  default: `
RHYTHM TEMPLATES — suggested starting points, not rules. Adapt freely.

10s (300 frames) — 3-4 scenes:
- Suggested: HeroRealShot → FeatureCallout → CTA (add one TextPunch between if pacing needs it)
- Note: BentoGrid and CursorDemo are not recommended for 10s — too little time to be effective.

30s (900 frames) — 5-7 scenes:
- Default:           HeroRealShot → FeatureCallout × 2-3 → TextPunch → CTA
- Feature-dense:     HeroRealShot → BentoGrid → TextPunch → CTA
- Interaction-first: TextPunch (hook) → CursorDemo → FeatureCallout × 2 → CTA
- Scroll-heavy:      HeroRealShot → SmoothScroll → FeatureCallout × 2 → CTA

60s (1800 frames) — 7-10 scenes:
- Default:      HeroRealShot → FeatureCallout × 3-4 → TextPunch × 2 → SmoothScroll → CTA
- Demo-heavy:   TextPunch → HeroRealShot → CursorDemo × 2 → FeatureCallout × 2 → BentoGrid → CTA
- Visual-story: HeroRealShot → SmoothScroll → BentoGrid → TextPunch → FeatureCallout × 2 → CTA`,
};

function buildRhythmSection(industry: IndustryCategory): string {
  return RHYTHM_TEMPLATES_BY_INDUSTRY[industry].trim() + '\n\nThese are starting points. Mix and match. Generic is failure.';
}

export interface BuildSystemPromptOpts {
  profile?: PacingProfile;
  /** When 'zh', inject a locale directive requiring Chinese output text. */
  locale?: 'zh' | 'en';
  /** Controls which industry rhythm template is injected. Defaults to 'default'. */
  industry?: IndustryCategory;
}

const LOCALE_DIRECTIVE_ZH = `
LOCALE DIRECTIVE — REQUIRED:
The source website is in Chinese. ALL output text fields (scene titles, descriptions, TextPunch text, CTA headline, beat text, stat labels, etc.) MUST be written in Chinese (Traditional or Simplified, matching the source). Do NOT translate to English. Every text field must still satisfy HARD RULE #3 — it must be a substring or close Chinese paraphrase of a phrase from the provided sourceTexts whitelist.
`.trim();

export function buildSystemPrompt(opts: BuildSystemPromptOpts = {}): string {
  const rules = getPacingRules(opts.profile ?? 'default');
  const pacingBlock = rules.systemPromptAddition
    ? `\n\nPACING PROFILE — ${rules.profile.toUpperCase()}\n${rules.systemPromptAddition}`
    : '';
  const localeBlock = opts.locale === 'zh' ? `\n\n${LOCALE_DIRECTIVE_ZH}` : '';
  const rhythmBlock = buildRhythmSection(opts.industry ?? 'default');

  return `You are a video storyboard editor for a URL-to-demo-video generation system. Given crawler-extracted brand and content data from a website, plus a user's intent, produce a structured JSON storyboard that a Remotion renderer will turn into an MP4.

SCENE TYPES (v1 implemented subset):
${AVAILABLE_SCENES_PROMPT}

${HARD_RULES}

${CREATIVITY_DIRECTIVE}

${SCENE_PACING_DISCIPLINE}

${rhythmBlock}${pacingBlock}${localeBlock}

YOUR OUTPUT must be a valid Storyboard JSON object matching the structure described above. Nothing else.`;
}
