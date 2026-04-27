function rate(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

export function totalCostUsd(usage: ClaudeUsage): number {
  const inRate = rate('CLAUDE_INPUT_RATE_USD_PER_MTOK', 3);
  const outRate = rate('CLAUDE_OUTPUT_RATE_USD_PER_MTOK', 15);
  return (
    ((usage.input_tokens ?? 0) / 1_000_000) * inRate +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * inRate * 0.1 +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * inRate * 1.25 +
    ((usage.output_tokens ?? 0) / 1_000_000) * outRate
  );
}
