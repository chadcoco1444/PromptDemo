import { describe, it, expect } from 'vitest';
import { buildUserMessage } from '../src/prompts/userMessage.js';
import crawlFixture from '@promptdemo/schema/fixtures/crawlResult.saas-landing.json' with { type: 'json' };
import type { CrawlResult } from '@promptdemo/schema';

const crawl = crawlFixture as unknown as CrawlResult;

describe('buildUserMessage', () => {
  it('embeds intent, duration, and crawl-derived fields', () => {
    const msg = buildUserMessage({
      intent: 'emphasize the enterprise-grade security',
      duration: 30,
      crawlResult: crawl,
    });
    expect(msg).toContain('emphasize the enterprise-grade security');
    expect(msg).toContain('900'); // 30s in frames
    for (const t of crawl.sourceTexts) expect(msg).toContain(t);
  });

  it('includes regenerate context when parentStoryboard + hint provided', () => {
    const msg = buildUserMessage({
      intent: 'x',
      duration: 10,
      crawlResult: crawl,
      regenerate: {
        previousStoryboard: { sceneId: 99 } as unknown as object,
        hint: 'make scene 2 faster',
      },
    });
    expect(msg).toContain('make scene 2 faster');
    expect(msg).toContain('99');
  });

  it('converts duration 10|30|60 → 300|900|1800 frames', () => {
    expect(buildUserMessage({ intent: 'x', duration: 10, crawlResult: crawl })).toContain('300');
    expect(buildUserMessage({ intent: 'x', duration: 30, crawlResult: crawl })).toContain('900');
    expect(buildUserMessage({ intent: 'x', duration: 60, crawlResult: crawl })).toContain('1800');
  });
});
