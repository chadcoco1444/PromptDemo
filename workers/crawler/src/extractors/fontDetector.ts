const GENERICS = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', '-apple-system']);

export function pickPrimaryFontFamily(stack: string): string | undefined {
  if (!stack) return undefined;
  const first = stack.split(',')[0]?.trim().replace(/^["']|["']$/g, '') ?? '';
  if (!first) return undefined;
  if (GENERICS.has(first.toLowerCase())) return undefined;
  return first;
}

// Keep in sync with @remotion/google-fonts whitelist used by packages/remotion/src/fonts.ts (Plan 3).
const SUPPORTED = new Set([
  'Inter',
  'Poppins',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Playfair Display',
  'JetBrains Mono',
  'Source Sans 3',
  'DM Sans',
  'Nunito',
]);

export function isGoogleFontSupported(family: string): boolean {
  return SUPPORTED.has(family);
}
