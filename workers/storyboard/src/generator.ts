import type { CrawlResult, Storyboard } from '@promptdemo/schema';
import { buildSystemPrompt } from './prompts/systemPrompt.js';
import { buildUserMessage } from './prompts/userMessage.js';
import { parseJson } from './validation/parseJson.js';
import { zodValidate } from './validation/zodValidate.js';
import { extractiveCheck } from './validation/extractiveCheck.js';
import { adjustDuration, adjustStoryboardDuration } from './validation/durationAdjust.js';
import type { ClaudeClient } from './claude/claudeClient.js';

const MAX_ATTEMPTS = 3;

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
}

export async function generateStoryboard(input: GenerateInput): Promise<GenerateResult> {
  const systemPrompt = buildSystemPrompt();
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
    const msg = feedback ? `${userMessage}\n\n## Previous attempt errors — fix these:\n${feedback}` : userMessage;
    const resp = await input.claude.complete({ systemPrompt, userMessage: msg });
    if (resp.kind === 'error') {
      feedback = `Claude API error: ${resp.message}`;
      continue;
    }

    const parsed = parseJson(resp.text);
    if (parsed.kind === 'error') {
      feedback = parsed.message;
      continue;
    }

    // Pre-zod duration normalization: StoryboardSchema enforces strict sum
    // equality, so any drift within the 5% tolerance must be auto-prorated
    // before Zod runs. Drift over tolerance is reported back as feedback.
    let candidate: unknown = parsed.value;
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

    const validated = zodValidate(candidate);
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
