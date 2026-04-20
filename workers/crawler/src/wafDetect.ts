export type WafCheck = { blocked: false } | { blocked: true; reason: string };

export function detectWafBlock(input: { status: number; html: string }): WafCheck {
  if (input.status === 403) return { blocked: true, reason: 'http-403' };
  if (input.status === 429) return { blocked: true, reason: 'http-429' };

  const titleMatch = input.html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.toLowerCase() ?? '';
  if (title.includes('just a moment') || title.includes('attention required')) {
    return { blocked: true, reason: 'cloudflare-challenge' };
  }

  if (input.html.includes('challenges.cloudflare.com/cdn-cgi/challenge-platform')) {
    return { blocked: true, reason: 'turnstile' };
  }

  if (input.html.includes('id="challenge-form"') || input.html.includes('cf-challenge-running')) {
    return { blocked: true, reason: 'cloudflare-challenge' };
  }

  return { blocked: false };
}
