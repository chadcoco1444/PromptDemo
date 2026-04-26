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

  it('suppresses StatsCounter when no numeric phrases in sourceTexts', () => {
    const msg = buildUserMessage({
      intent: 'show features',
      duration: 30,
      crawlResult: makeCrawl({ sourceTexts: ['Great product for teams', 'Easy to use'] }),
    });
    expect(msg).toContain('StatsCounter');
    expect(msg).toContain('MUST NOT');
    expect(msg).toContain('SCENE RESTRICTIONS');
  });

  it('allows StatsCounter when sourceTexts contain numeric phrases', () => {
    const msg = buildUserMessage({
      intent: 'show metrics',
      duration: 30,
      crawlResult: makeCrawl({ sourceTexts: ['10× faster than competitors', '99.9% uptime guaranteed'] }),
    });
    expect(msg).not.toMatch(/StatsCounter.*MUST NOT/);
  });

  it('suppresses ReviewMarquee when fewer than 2 reviews available', () => {
    const msg = buildUserMessage({
      intent: 'show social proof',
      duration: 30,
      crawlResult: { ...makeCrawl({}), reviews: [] } as unknown as CrawlResult,
    });
    expect(msg).toContain('ReviewMarquee');
    expect(msg).toContain('MUST NOT');
  });

  it('allows ReviewMarquee and shows review data when 2+ reviews available', () => {
    const msg = buildUserMessage({
      intent: 'show social proof',
      duration: 30,
      crawlResult: {
        ...makeCrawl({}),
        reviews: [
          { text: 'This product changed everything about our daily workflow.', author: 'Alice' },
          { text: 'Absolutely essential tool for modern software engineering teams.' },
        ],
      } as unknown as CrawlResult,
    });
    expect(msg).toContain('## Available reviews');
    expect(msg).toContain('Alice');
    expect(msg).not.toMatch(/ReviewMarquee.*MUST NOT/);
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
