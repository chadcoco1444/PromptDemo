import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { inputCostUsd, outputCostUsd, totalCostUsd } from '../../src/anthropic/pricing.js';

describe('pricing', () => {
  beforeEach(() => {
    delete process.env.CLAUDE_INPUT_RATE_USD_PER_MTOK;
    delete process.env.CLAUDE_OUTPUT_RATE_USD_PER_MTOK;
  });

  afterEach(() => {
    delete process.env.CLAUDE_INPUT_RATE_USD_PER_MTOK;
    delete process.env.CLAUDE_OUTPUT_RATE_USD_PER_MTOK;
  });

  it('defaults to Sonnet 4.6 published rates ($3/M input, $15/M output)', () => {
    expect(inputCostUsd(1_000_000)).toBeCloseTo(3, 6);
    expect(outputCostUsd(1_000_000)).toBeCloseTo(15, 6);
  });

  it('respects env overrides', () => {
    process.env.CLAUDE_INPUT_RATE_USD_PER_MTOK = '6';
    process.env.CLAUDE_OUTPUT_RATE_USD_PER_MTOK = '30';
    expect(inputCostUsd(1_000_000)).toBeCloseTo(6, 6);
    expect(outputCostUsd(1_000_000)).toBeCloseTo(30, 6);
  });

  it('totalCostUsd combines input + output + cache adjustments', () => {
    // 1M base input ($3) + 1M cache_read ($0.30 — 10% rate) + 1M output ($15)
    const cost = totalCostUsd({
      input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3 + 0.3 + 15, 4);
  });

  it('cache_creation tokens billed at 125%', () => {
    const cost = totalCostUsd({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(3 * 1.25, 4);
  });

  it('handles missing optional cache fields', () => {
    const cost = totalCostUsd({ input_tokens: 1000, output_tokens: 500 });
    // 1000 * 3/1M + 500 * 15/1M = 0.003 + 0.0075 = 0.0105
    expect(cost).toBeCloseTo(0.0105, 6);
  });
});
