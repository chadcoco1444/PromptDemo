import { SCENE_CATALOG, V1_IMPLEMENTED_SCENE_TYPES } from './sceneTypeCatalog.js';

const HARD_RULES = `
HARD RULES — violating any of these means your output will be rejected and you will be asked to retry:

1. Output valid JSON only. No markdown, no prose, no code fences. The entire response must parse with JSON.parse.
2. The top-level shape is { videoConfig, assets, scenes }. Use the exact structure in the schema below.
3. Every text field in every scene (titles, descriptions, beat text, TextPunch text, CTA headline, etc.) MUST be a substring or close paraphrase of something in the provided sourceTexts whitelist. You may not invent product claims, features, or taglines.
4. \`scene.type\` must be one of: ${V1_IMPLEMENTED_SCENE_TYPES.join(', ')}. Other types exist in the schema but are NOT implemented in v1; do not use them.
5. Scene durationInFrames values must sum exactly to videoConfig.durationInFrames. (Minor rounding ±5% is auto-corrected downstream — but aim for exact.)
6. fps is always 30. videoConfig.durationInFrames is always 300 (10s), 900 (30s), or 1800 (60s).
7. Every scene needs entryAnimation and exitAnimation. Valid: fade, slideLeft, slideRight, slideUp, zoomIn, zoomOut, none.
8. brandColor must be the brand color from the input (or #1a1a1a fallback). Do not substitute other colors.
`.trim();

const RHYTHM_TEMPLATES = `
RHYTHM TEMPLATES — guidance for pacing, not hard rules:

- 10s (300 frames): 3-4 scenes. Always HeroRealShot (or HeroStylized if no screenshot), one FeatureCallout, CTA. Optionally one TextPunch between.
- 30s (900 frames): 5-7 scenes. HeroRealShot, 2-3 FeatureCallouts, one TextPunch as pacing break, optionally a SmoothScroll if fullPage screenshot is available, CTA.
- 60s (1800 frames): 7-10 scenes. HeroRealShot, 3-4 FeatureCallouts, multiple TextPunch breaks, SmoothScroll if available, optional closing TextPunch before CTA.
`.trim();

const SCHEMA_HINT = Object.entries(SCENE_CATALOG)
  .filter(([type]) => V1_IMPLEMENTED_SCENE_TYPES.includes(type as (typeof V1_IMPLEMENTED_SCENE_TYPES)[number]))
  .map(([type, desc]) => `  - ${type}: ${desc}`)
  .join('\n');

export function buildSystemPrompt(): string {
  return `You are a video storyboard editor for a URL-to-demo-video generation system. Given crawler-extracted brand and content data from a website, plus a user's intent, produce a structured JSON storyboard that a Remotion renderer will turn into an MP4.

SCENE TYPES (v1 implemented subset):
${SCHEMA_HINT}

${HARD_RULES}

${RHYTHM_TEMPLATES}

YOUR OUTPUT must be a valid Storyboard JSON object matching the structure described above. Nothing else.`;
}
