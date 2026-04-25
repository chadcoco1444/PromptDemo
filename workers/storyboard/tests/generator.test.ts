import { describe, it, expect, vi } from 'vitest';
import { generateStoryboard } from '../src/generator.js';
import type { ClaudeClient } from '../src/claude/claudeClient.js';
import crawlFixture from '@promptdemo/schema/fixtures/crawlResult.saas-landing.json' with { type: 'json' };
import validStoryboard from '@promptdemo/schema/fixtures/storyboard.30s.json' with { type: 'json' };
import type { CrawlResult } from '@promptdemo/schema';

const crawl = crawlFixture as unknown as CrawlResult;

function mockClient(...responses: string[]): ClaudeClient {
  const queue = [...responses];
  return {
    complete: vi.fn().mockImplementation(async () => {
      const next = queue.shift();
      if (next === undefined) throw new Error('no more mock responses');
      return { kind: 'ok', text: next, usage: { input_tokens: 100, output_tokens: 50 } };
    }),
  };
}

describe('generateStoryboard', () => {
  it('succeeds on first try with a valid fixture response', async () => {
    const client = mockClient(JSON.stringify(validStoryboard));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'showcase AI workflows',
      duration: 30,
      showWatermark: false,
    });
    expect(result.kind).toBe('ok');
  });

  it('retries on JSON parse failure and succeeds on second try', async () => {
    const client = mockClient('not-json-first-attempt', JSON.stringify(validStoryboard));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
      showWatermark: false,
    });
    expect(result.kind).toBe('ok');
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('gives up after 3 total attempts', async () => {
    const client = mockClient('bad1', 'bad2', 'bad3');
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
      showWatermark: false,
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.attempts).toBe(3);
  });

  it('overwrites CTA scene url with the source URL even if Claude emits garbage', async () => {
    // Claude regression: occasionally produces a relative path or an invented
    // shortened url (fails z.string().url()) for the CTA scene. We enrich
    // it deterministically from crawlResult.url so this never burns a retry.
    const broken = JSON.parse(JSON.stringify(validStoryboard));
    const ctaIdx = (broken.scenes as Array<{ type: string }>).findIndex((s) => s.type === 'CTA');
    expect(ctaIdx).toBeGreaterThanOrEqual(0);
    broken.scenes[ctaIdx].props.url = 'invented-not-a-url';
    const client = mockClient(JSON.stringify(broken));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
      showWatermark: false,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const cta = result.storyboard.scenes.find((s) => s.type === 'CTA');
      expect(cta).toBeDefined();
      // Enriched URL should match crawlResult.url, not Claude's garbage.
      expect((cta as { props: { url: string } }).props.url).toBe(crawl.url);
    }
    // Single Claude call, no retry needed.
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('auto-prorates minor duration drift without retry', async () => {
    // Take valid fixture, perturb one scene by +5 frames (<<5%)
    const perturbed = JSON.parse(JSON.stringify(validStoryboard));
    perturbed.scenes[0].durationInFrames += 5; // drifts sum
    const client = mockClient(JSON.stringify(perturbed));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
      showWatermark: false,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const sum = result.storyboard.scenes.reduce((a, s) => a + s.durationInFrames, 0);
      expect(sum).toBe(900);
    }
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('sets showWatermark:true in videoConfig when input.showWatermark is true', async () => {
    const client = mockClient(JSON.stringify(validStoryboard));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
      showWatermark: true,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.storyboard.videoConfig.showWatermark).toBe(true);
    }
  });

  it('sets showWatermark:false in videoConfig when input.showWatermark is false', async () => {
    const client = mockClient(JSON.stringify(validStoryboard));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
      showWatermark: false,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.storyboard.videoConfig.showWatermark).toBe(false);
    }
  });

  it('overrides LLM output: showWatermark:false from Claude is ignored when input.showWatermark is true', async () => {
    // Critical enforcement guarantee: even if LLM emits showWatermark:false,
    // the enrichFromCrawlResult deterministic override must set it to true.
    const withLlmFalse = JSON.parse(JSON.stringify(validStoryboard));
    withLlmFalse.videoConfig.showWatermark = false;
    const client = mockClient(JSON.stringify(withLlmFalse));
    const result = await generateStoryboard({
      claude: client,
      crawlResult: crawl,
      intent: 'x',
      duration: 30,
      showWatermark: true,
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.storyboard.videoConfig.showWatermark).toBe(true);
    }
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
