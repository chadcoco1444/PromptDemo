export type ParseResult =
  | { kind: 'ok'; value: unknown }
  | { kind: 'error'; message: string };

export function parseJson(input: string): ParseResult {
  let text = input.trim();
  // Strip markdown code fences
  const fenceMatch = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) text = fenceMatch[1]!.trim();
  try {
    return { kind: 'ok', value: JSON.parse(text) };
  } catch (err) {
    return { kind: 'error', message: `JSON parse failed: ${(err as Error).message}` };
  }
}
