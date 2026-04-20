import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CrawlResultSchema, StoryboardSchema } from '../src/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
function load(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

describe('crawlResult fixtures', () => {
  for (const f of [
    'crawlResult.saas-landing.json',
    'crawlResult.ecommerce.json',
    'crawlResult.docs.json',
    'crawlResult.logo-missing.json',
    'crawlResult.font-unsupported.json',
  ]) {
    it(`${f} is valid`, () => {
      expect(() => CrawlResultSchema.parse(load(f))).not.toThrow();
    });
  }
});

describe('storyboard fixtures', () => {
  for (const f of ['storyboard.10s.json', 'storyboard.30s.json', 'storyboard.60s.json', 'storyboard.tierB-fallback.json']) {
    it(`${f} is valid`, () => {
      expect(() => StoryboardSchema.parse(load(f))).not.toThrow();
    });
  }
});
