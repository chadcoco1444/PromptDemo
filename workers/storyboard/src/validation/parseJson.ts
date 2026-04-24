export type ParseResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'error'; message: string };

/**
 * Extracts the first balanced `{...}` block from `text`. Handles nested
 * braces and string literals with escaped quotes. Returns null if no balanced
 * block is found. Used as the fallback when Claude wraps the JSON in prose
 * instead of a markdown code fence.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escaped) { escaped = false; continue; }
    if (inString) {
      if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

export function parseJson(input: string): ParseResult {
  let text = input.trim();

  // Preferred path: Claude wrapped the JSON in a ```json fence.
  const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) text = fenceMatch[1]!.trim();

  // First-attempt parse on the fenced or trimmed whole text.
  try {
    return { kind: 'ok', value: JSON.parse(text) };
  } catch (firstErr) {
    // Fallback: Claude may have added a prose note after the JSON object
    // (happens on edge retries). Extract the first balanced {...} and try
    // again; on success we silently recover. On failure, surface the
    // ORIGINAL error so feedback-to-Claude matches what Claude actually sees.
    const extracted = extractFirstJsonObject(text);
    if (extracted && extracted !== text) {
      try {
        return { kind: 'ok', value: JSON.parse(extracted) };
      } catch {
        // fall through to original error
      }
    }
    return { kind: 'error', message: `JSON parse failed: ${(firstErr as Error).message}` };
  }
}
