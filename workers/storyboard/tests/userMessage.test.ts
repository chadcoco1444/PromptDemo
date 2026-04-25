import { describe, it, expect } from 'vitest';
import { buildUserMessage } from '../src/prompts/userMessage.js';
import crawlFixture from '@lumespec/schema/fixtures/crawlResult.saas-landing.json' with { type: 'json' };
import type { CrawlResult } from '@lumespec/schema';

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

function makeCrawl(overrides: {
  sourceTexts?: string[];
  features?: Array<{ title: string; description?: string }>;
}): CrawlResult {
  return {
    brand: { name: 'Acme', primaryColor: '#7c3aed' },
    screenshots: { viewport: 's3://bucket/viewport.png' },
    sourceTexts: overrides.sourceTexts ?? ['Great product for teams'],
    features: (overrides.features ?? []) as CrawlResult['features'],
    tier: 'A',
    trackUsed: false,
  } as unknown as CrawlResult;
}

describe('buildUserMessage — style modifier injection', () => {
  it('appends ## Product Style Guidance block for developer_tool', () => {
    const msg = buildUserMessage({
      intent: 'show the api',
      duration: 30,
      crawlResult: makeCrawl({ sourceTexts: ['REST API with webhooks and SDK'] }),
    });
    expect(msg).toContain('## Product Style Guidance');
    expect(msg).toContain('CursorDemo');
  });

  it('appends style guidance for saas_tool (3+ features)', () => {
    const msg = buildUserMessage({
      intent: 'show features',
      duration: 30,
      crawlResult: makeCrawl({
        sourceTexts: ['Team collaboration platform'],
        features: [
          { title: 'Reports', description: 'Analytics' },
          { title: 'Integrations', description: 'Connect tools' },
          { title: 'Automations', description: 'Save time' },
        ],
      }),
    });
    expect(msg).toContain('## Product Style Guidance');
    expect(msg).toContain('BentoGrid');
  });

  it('does NOT append style guidance for default (no signals)', () => {
    const msg = buildUserMessage({
      intent: 'generic video',
      duration: 10,
      crawlResult: makeCrawl({ features: [], sourceTexts: ['Nice product'] }),
    });
    expect(msg).not.toContain('## Product Style Guidance');
  });

  it('style guidance block comes after the existing blocks', () => {
    const msg = buildUserMessage({
      intent: 'show api',
      duration: 30,
      crawlResult: makeCrawl({ sourceTexts: ['API-first platform with SDK'] }),
    });
    const crawlerIdx = msg.indexOf('## Crawler tier');
    const guidanceIdx = msg.indexOf('## Product Style Guidance');
    expect(guidanceIdx).toBeGreaterThan(crawlerIdx);
    const returnIdx = msg.indexOf('Return a valid Storyboard JSON');
    expect(guidanceIdx).toBeLessThan(returnIdx);
  });
});
