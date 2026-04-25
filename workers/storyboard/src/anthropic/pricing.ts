/**
 * Token → USD pricing for the spend-guard. Rates are env-configurable so we
 * don't have to ship code on every Anthropic price change. Defaults match
 * the public Sonnet 4.6 pricing as of 2026-04: $3/M input, $15/M output.
 */
function rate(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function inputCostUsd(tokens: number): number {
  return (tokens / 1_000_000) * rate('CLAUDE_INPUT_RATE_USD_PER_MTOK', 3);
}

export function outputCostUsd(tokens: number): number {
  return (tokens / 1_000_000) * rate('CLAUDE_OUTPUT_RATE_USD_PER_MTOK', 15);
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/**
 * Compute the all-in USD cost of a single Claude call. Cache-read tokens
 * are billed at 10% of regular input rate per Anthropic's pricing page;
 * cache-creation tokens are billed at 125% of regular input rate.
 */
export function totalCostUsd(usage: ClaudeUsage): number {
  const baseInput = usage.input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;
  return (
    inputCostUsd(baseInput) +
    inputCostUsd(cacheRead) * 0.1 +
    inputCostUsd(cacheCreate) * 1.25 +
    outputCostUsd(usage.output_tokens ?? 0)
  );
}
