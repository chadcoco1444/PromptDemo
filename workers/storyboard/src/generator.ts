import type { Pool } from 'pg';
import type { CrawlResult, Storyboard } from '@promptdemo/schema';
import { buildSystemPrompt } from './prompts/systemPrompt.js';
import { buildUserMessage } from './prompts/userMessage.js';
import { detectPacingProfile } from './prompts/pacingProfiles.js';
import { parseJson } from './validation/parseJson.js';
import { zodValidate } from './validation/zodValidate.js';
import { extractiveCheck } from './validation/extractiveCheck.js';
import { adjustDuration, adjustStoryboardDuration } from './validation/durationAdjust.js';
import { selectVariants } from './variantSelection.js';
import type { ClaudeClient } from './claude/claudeClient.js';
import { assertBudgetAvailable, recordSpend, BudgetExceededError } from './anthropic/spendGuard.js';

const MAX_ATTEMPTS = 3;
const DURATION_FRAMES: Record<10 | 30 | 60, number> = { 10: 300, 30: 900, 60: 1800 };
// Default brand color when the crawler's color sampler returns nothing OR
// returns a color too extreme for a legible gradient (near-black / near-white).
// Indigo-600 matches the saas-landing fixture palette so videos look consistent
// when the brand fallback kicks in, rather than a dead-black void.
const DEFAULT_BRAND_COLOR = '#4f46e5';
const DEFAULT_BGM = 'minimal' as const;

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The crawler's sampler can land on near-black or near-white colors (dark-themed
 * product sites have buttons/surfaces that slip past the neutral filter, and
 * minimal sites with light surfaces do the same on the other end). Either
 * extreme collapses the 3-stop gradient palette into a flat band, so FeatureCallout's
 * FakePanel looks dead. Guard against it here: if the detected color is outside
 * a legible luminance band, use the default instead.
 */
function pickBrandColor(detected: string | undefined): string {
  if (!detected) return DEFAULT_BRAND_COLOR;
  const lum = relativeLuminance(detected);
  if (lum < 0.18 || lum > 0.88) return DEFAULT_BRAND_COLOR;
  return detected;
}

/**
 * Fill in deterministic Storyboard fields that Claude consistently under-specifies:
 *   - videoConfig.{durationInFrames, fps, brandColor, logoUrl}  (deterministic from input)
 *   - videoConfig.bgm  (defaulted if Claude missed it)
 *   - assets.{screenshots, sourceTexts}  (must equal crawlResult exactly)
 *
 * Claude retains authority over: scenes[], videoConfig.bgm (if present).
 */
/**
 * Collected text whitelist the extractive check validates against. Mirrors what
 * buildUserMessage shows Claude: raw sourceTexts + feature titles + feature
 * descriptions. Deduped, in insertion order.
 */
function buildSourceTextPool(crawlResult: CrawlResult): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string | undefined) => {
    if (!s) return;
    if (seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  for (const t of crawlResult.sourceTexts) push(t);
  for (const f of crawlResult.features) {
    push(f.title);
    push(f.description);
  }
  return out;
}

function enrichFromCrawlResult(
  candidate: unknown,
  input: { crawlResult: CrawlResult; duration: 10 | 30 | 60 }
): unknown {
  if (!candidate || typeof candidate !== 'object') return candidate;
  const obj = candidate as Record<string, unknown>;
  const videoConfig = (obj.videoConfig && typeof obj.videoConfig === 'object')
    ? (obj.videoConfig as Record<string, unknown>)
    : {};

  const brand = input.crawlResult.brand;
  const screenshots = input.crawlResult.screenshots;
  const enrichedAssets = {
    screenshots,
    sourceTexts: buildSourceTextPool(input.crawlResult),
  };

  const rawScenes = Array.isArray(obj.scenes) ? (obj.scenes as unknown[]) : [];
  // Normalize sceneId BEFORE the variant selector + zodValidate: Claude
  // sometimes emits sceneId as null/undefined/non-numeric-string which then
  // coerces to NaN and fails validation with a confusing "Expected number,
  // received nan" message. Array index + 1 is a sensible deterministic
  // fallback; Claude's sceneId is advisory (we don't rely on it for ordering
  // — scenes[] is already ordered by the array itself).
  const normalizedScenes = rawScenes.map((s, i) => {
    if (!s || typeof s !== 'object') return s;
    const obj = s as Record<string, unknown>;
    let next: Record<string, unknown> = obj;

    const n = Number(obj.sceneId);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
      next = { ...next, sceneId: i + 1 };
    }

    // CTA scenes: deterministically inject the source URL. Claude often
    // emits malformed or invented urls (relative paths, missing scheme,
    // attempted shortened forms) which fail z.string().url() and burn a
    // retry. Same enrichment pattern as brandColor/screenshots/fps.
    if (next.type === 'CTA' && typeof next.props === 'object' && next.props !== null) {
      next = {
        ...next,
        props: { ...(next.props as Record<string, unknown>), url: input.crawlResult.url },
      };
    }
    return next;
  });

  // Cast is safe: selector only reads `type` + `props`; Zod validation downstream
  // will reject anything malformed.
  const withVariants = selectVariants(
    normalizedScenes as never,
    enrichedAssets as never,
    input.crawlResult.features.length
  );

  const enriched: Record<string, unknown> = {
    ...obj,
    videoConfig: {
      // defaults first (overridden by Claude's picks if present)
      bgm: DEFAULT_BGM,
      ...videoConfig,
      // deterministic overrides (Claude cannot change these)
      durationInFrames: DURATION_FRAMES[input.duration],
      fps: 30,
      brandColor: pickBrandColor(brand.primaryColor),
      ...(brand.logoUrl ? { logoUrl: brand.logoUrl } : {}),
    },
    assets: enrichedAssets,
    scenes: withVariants,
  };
  return enriched;
}

export type GenerateResult =
  | { kind: 'ok'; storyboard: Storyboard; attempts: number }
  | { kind: 'error'; message: string; attempts: number };

export interface GenerateInput {
  claude: ClaudeClient;
  crawlResult: CrawlResult;
  intent: string;
  duration: 10 | 30 | 60;
  hint?: string;
  previousStoryboard?: Storyboard;
  /**
   * When non-null, the Anthropic daily spend guard runs pre-flight (rejects
   * with STORYBOARD_BUDGET_EXCEEDED if cap is hit) and post-call (records
   * the cost from the usage block). Null = guard disabled, behavior matches
   * pre-Phase-5.
   */
  spendGuardPool?: Pool | null;
}

export async function generateStoryboard(input: GenerateInput): Promise<GenerateResult> {
  // Detect once at the top — same profile drives system-prompt injection
  // AND the post-zod validation cap. Keeps the two in lockstep so a profile
  // change can never desync the prompt-side instructions from the validator.
  const profile = detectPacingProfile(input.intent);
  const systemPrompt = buildSystemPrompt({ profile });
  const userMessage = buildUserMessage({
    intent: input.intent,
    duration: input.duration,
    crawlResult: input.crawlResult,
    ...(input.hint && input.previousStoryboard
      ? { regenerate: { hint: input.hint, previousStoryboard: input.previousStoryboard } }
      : {}),
  });
  let feedback = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Pre-flight budget gate. Guard auto-resets at UTC midnight.
    try {
      await assertBudgetAvailable({ pool: input.spendGuardPool ?? null });
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        return { kind: 'error', message: `${err.code}: ${err.message}`, attempts: attempt };
      }
      throw err;
    }

    const msg = feedback ? `${userMessage}\n\n## Previous attempt errors — fix these:\n${feedback}` : userMessage;
    const resp = await input.claude.complete({ systemPrompt, userMessage: msg });
    if (resp.kind === 'error') {
      feedback = `Claude API error: ${resp.message}`;
      continue;
    }
    // Record actual spend whether or not validation succeeds — we already
    // paid for the tokens. Best-effort; failure here doesn't fail the job.
    await recordSpend({ pool: input.spendGuardPool ?? null }, resp.usage).catch((err) =>
      console.error('[storyboard] recordSpend failed:', err),
    );

    const parsed = parseJson(resp.text);
    if (parsed.kind === 'error') {
      feedback = parsed.message;
      continue;
    }

    // Enrich with deterministic fields the crawler already knows — keeps Claude
    // responsible only for scenes[] + bgm choice.
    let candidate: unknown = enrichFromCrawlResult(parsed.value, {
      crawlResult: input.crawlResult,
      duration: input.duration,
    });

    // Pre-zod duration normalization: StoryboardSchema enforces strict sum
    // equality, so any drift within the 5% tolerance must be auto-prorated
    // before Zod runs. Drift over tolerance is reported back as feedback.
    if (
      candidate &&
      typeof candidate === 'object' &&
      'videoConfig' in candidate &&
      'scenes' in candidate &&
      Array.isArray((candidate as { scenes: unknown }).scenes)
    ) {
      const shaped = candidate as {
        videoConfig: { durationInFrames?: unknown };
        scenes: Array<{ durationInFrames?: unknown }>;
      };
      const targetOk = typeof shaped.videoConfig.durationInFrames === 'number';
      const scenesOk = shaped.scenes.every((s) => typeof s.durationInFrames === 'number');
      if (targetOk && scenesOk) {
        const adj = adjustDuration({
          videoConfig: { durationInFrames: shaped.videoConfig.durationInFrames as number },
          scenes: shaped.scenes.map((s) => ({ ...s, durationInFrames: s.durationInFrames as number })),
        });
        if (adj.kind === 'retry') {
          feedback = adj.reason;
          continue;
        }
        candidate = {
          ...(candidate as object),
          scenes: shaped.scenes.map((s, i) => ({
            ...s,
            durationInFrames: adj.storyboard.scenes[i]!.durationInFrames,
          })),
        };
      }
    }

    const validated = zodValidate(candidate, { profile });
    if (validated.kind === 'error') {
      feedback = `Zod validation failed:\n${validated.issues.join('\n')}`;
      continue;
    }

    const extractive = extractiveCheck(validated.storyboard);
    if (extractive.kind === 'error') {
      feedback = `Extractive check failed — these phrases are not in sourceTexts:\n${extractive.violations
        .map((v) => ` scene ${v.sceneId}: "${v.text}"`)
        .join('\n')}`;
      continue;
    }

    const adjusted = adjustStoryboardDuration(validated.storyboard);
    if (adjusted.kind === 'retry') {
      feedback = adjusted.reason;
      continue;
    }

    return { kind: 'ok', storyboard: adjusted.storyboard, attempts: attempt };
  }

  return { kind: 'error', message: `STORYBOARD_GEN_FAILED: ${feedback}`, attempts: MAX_ATTEMPTS };
}
