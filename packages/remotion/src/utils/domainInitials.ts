const STRIP_SUBDOMAINS = new Set(['www', 'app', 'm', 'en', 'us']);

export function domainInitials(url: string): string {
  try {
    const host = new URL(url).hostname;
    const parts = host.split('.');
    // Strip common subdomain prefix
    if (parts.length > 2 && parts[0] && STRIP_SUBDOMAINS.has(parts[0])) {
      parts.shift();
    }
    const root = parts[0] ?? '';
    // Split on common separators for multi-word brand names
    const words = root.split(/[-_]/).filter(Boolean);
    if (words.length >= 2) {
      return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
    }
    return (root[0] ?? '?').toUpperCase();
  } catch {
    return '?';
  }
}
