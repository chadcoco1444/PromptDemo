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

/**
 * Apply lightweight repairs to common Claude JSON mistakes:
 *   - Trailing commas before `}` or `]` (observed in v2.0 E2E)
 *   - Smart quotes (" " ' ') replaced with straight quotes
 *   - Literal tab / newline inside string content escaped
 * Preserves content semantics — never invents data. Every repair is applied
 * OUTSIDE of string literals (tracked by depth/escape state like the
 * extractor above), so legitimate occurrences inside JSON string values are
 * left alone.
 */
function repairJson(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (escaped) {
      out += c;
      escaped = false;
      continue;
    }
    if (inString) {
      if (c === '\\') { out += c; escaped = true; continue; }
      if (c === '"') { out += c; inString = false; continue; }
      // Smart quotes inside a string → straight quote + escape
      if (c === '“' || c === '”') { out += '\\"'; continue; }
      if (c === '‘' || c === '’') { out += "'"; continue; }
      // Unescaped raw newline/tab inside a string → escape
      if (c === '\n') { out += '\\n'; continue; }
      if (c === '\r') { out += '\\r'; continue; }
      if (c === '\t') { out += '\\t'; continue; }
      out += c;
      continue;
    }
    if (c === '"') { out += c; inString = true; continue; }
    // Outside strings:
    // Strip trailing commas before } or ]
    if (c === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j]!)) j++;
      const next = text[j];
      if (next === '}' || next === ']') {
        // Skip the stray comma; keep the following whitespace + bracket.
        continue;
      }
    }
    out += c;
  }
  return out;
}

export function parseJson(input: string): ParseResult {
  let text = input.trim();

  // Preferred path: Claude wrapped the JSON in a ```json fence.
  const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) text = fenceMatch[1]!.trim();

  // Attempt 1: parse whatever we have after fence-stripping.
  try {
    return { kind: 'ok', value: JSON.parse(text) };
  } catch (firstErr) {
    // Attempt 2: extract the first balanced {...} to recover from trailing
    // prose (Claude occasionally adds a "Note: ..." after the JSON).
    const extracted = extractFirstJsonObject(text) ?? text;
    if (extracted !== text) {
      try {
        return { kind: 'ok', value: JSON.parse(extracted) };
      } catch {
        // fall through to repair
      }
    }
    // Attempt 3: apply lightweight repairs (trailing commas, smart quotes,
    // unescaped newlines inside strings) and try again. This handles the
    // malformed-inside-JSON class of failures the prior two passes can't.
    try {
      const repaired = repairJson(extracted);
      return { kind: 'ok', value: JSON.parse(repaired) };
    } catch {
      // All three attempts failed — surface the ORIGINAL error so Claude's
      // retry feedback points at the real issue, not our repair artifact.
      return { kind: 'error', message: `JSON parse failed: ${(firstErr as Error).message}` };
    }
  }
}
