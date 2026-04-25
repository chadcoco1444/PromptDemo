/**
 * URL/hostname helpers used across the History page (lineage badge,
 * card hostname display, search-result rendering).
 *
 * Hostname normalization rules:
 *   - lowercased
 *   - leading "www." stripped (only the literal subdomain "www", not
 *     "www2." or other prefixes — we want vercel.com to match
 *     www.vercel.com but NOT www2.example.com)
 */
export function normalizeHostname(host: string): string {
  if (!host) return host;
  const lower = host.toLowerCase();
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

export function hostnameOf(url: string): string {
  if (!url) return url;
  try {
    return normalizeHostname(new URL(url).hostname);
  } catch {
    return url;
  }
}

export function hostnameMatches(a: string, b: string): boolean {
  return hostnameOf(a) === hostnameOf(b);
}
