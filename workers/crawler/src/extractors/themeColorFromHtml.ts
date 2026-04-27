import { load } from 'cheerio';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * Extract a hex color from <meta name="theme-color"> in the given HTML.
 * Prefers the first bare (no `media` attribute) tag; falls back to the first
 * `media`-attributed tag (typically a light/dark variant).
 *
 * Returns undefined if no valid hex is found. Note that the *caller* decides
 * whether the returned color is acceptable (e.g., neutral) — this function
 * does no semantic filtering, only syntactic validation.
 */
export function extractThemeColorFromHtml(html: string): string | undefined {
  const $ = load(html);
  const tags = $('meta[name="theme-color"]').toArray();
  // Prefer media-less first.
  for (const t of tags) {
    if (!$(t).attr('media')) {
      const c = $(t).attr('content')?.trim();
      if (c && HEX_RE.test(c)) return c.toLowerCase();
    }
  }
  // Fallback: first media-attributed tag.
  for (const t of tags) {
    const c = $(t).attr('content')?.trim();
    if (c && HEX_RE.test(c)) return c.toLowerCase();
  }
  return undefined;
}
