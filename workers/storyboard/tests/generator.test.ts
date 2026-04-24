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
      return { kind: 'ok', text: next };
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
    });
    expect(result.kind).toBe('error');
    if (result.kind === 'error') expect(result.attempts).toBe(3);
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
    });
    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      const sum = result.storyboard.scenes.reduce((a, s) => a + s.durationInFrames, 0);
      expect(sum).toBe(900);
    }
    expect((client.complete as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
