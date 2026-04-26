import type { CrawlResult } from '@lumespec/schema';
import { detectIndustry, STYLE_MODIFIERS } from './industryDetect.js';

const DURATION_TO_FRAMES = { 10: 300, 30: 900, 60: 1800 } as const;

export interface BuildUserMessageInput {
  intent: string;
  duration: 10 | 30 | 60;
  crawlResult: CrawlResult;
  regenerate?: {
    previousStoryboard: object;
    hint: string;
  };
}

export function buildUserMessage(input: BuildUserMessageInput): string {
  const frames = DURATION_TO_FRAMES[input.duration];

  const blocks: string[] = [];
  blocks.push(`## Intent\n${input.intent}`);
  blocks.push(`## Target duration\n${input.duration}s = ${frames} frames at 30fps.`);
  blocks.push(`## Brand\n${JSON.stringify(input.crawlResult.brand, null, 2)}`);
  blocks.push(
    `## Available screenshots (asset keys to reference)\n${JSON.stringify(
      Object.keys(input.crawlResult.screenshots),
      null,
      2
    )}`
  );
  blocks.push(
    `## sourceTexts (extractive whitelist — every scene text must come from here)\n${JSON.stringify(
      input.crawlResult.sourceTexts,
      null,
      2
    )}`
  );
  blocks.push(`## Features extracted\n${JSON.stringify(input.crawlResult.features, null, 2)}`);
  blocks.push(`## Crawler tier\n${input.crawlResult.tier} (trackUsed=${input.crawlResult.trackUsed})`);

  if (input.regenerate) {
    blocks.push(
      `## REGENERATE CONTEXT\nThe user was unsatisfied with a previous attempt. Adjust according to the hint below, but keep what worked.\n\nHint: ${input.regenerate.hint}\n\nPrevious storyboard:\n${JSON.stringify(
        input.regenerate.previousStoryboard,
        null,
        2
      )}`
    );
  }

  const modifier = STYLE_MODIFIERS[detectIndustry(input.crawlResult)];
  if (modifier) {
    blocks.push(`## Product Style Guidance\n${modifier}`);
  }

  // Data-driven scene gate: suppress data-hungry scenes when the required source
  // data is absent. Placed after style guidance so it reads as the final word.
  const restrictions: string[] = [];

  const hasNumericStat = /\b\d+\s*[%×xKkMmBb+]|\b\d{2,}\b/.test(
    input.crawlResult.sourceTexts.join(' ')
  );
  if (!hasNumericStat) {
    restrictions.push(
      'StatsCounter — no numeric phrases found in sourceTexts. MUST NOT use this scene.'
    );
  }

  const reviews = input.crawlResult.reviews ?? [];
  if (reviews.length < 2) {
    restrictions.push(
      'ReviewMarquee — fewer than 2 reviews available in crawlResult.reviews. MUST NOT use this scene.'
    );
  } else {
    blocks.push(
      `## Available reviews (use verbatim for ReviewMarquee)\n${JSON.stringify(reviews, null, 2)}`
    );
  }

  if (restrictions.length > 0) {
    blocks.push(
      `## SCENE RESTRICTIONS (data-driven — non-negotiable)\nThe following scenes MUST NOT appear in your storyboard because the required data is missing:\n${restrictions.map((r) => `- ${r}`).join('\n')}`
    );
  }

  blocks.push(`\nReturn a valid Storyboard JSON matching the hard rules in the system prompt.`);
  return blocks.join('\n\n');
}
