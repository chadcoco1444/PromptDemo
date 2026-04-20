import { describe, it, expect, vi } from 'vitest';
import { runCheerioTrack } from '../src/tracks/cheerioTrack.js';

describe('runCheerioTrack', () => {
  it('parses meta + source texts when fetch returns 200', async () => {
    const html = `
      <html>
        <head>
          <title>Docs</title>
          <meta property="og:image" content="https://cdn.example.com/og.png">
          <meta name="theme-color" content="#123456">
          <link rel="icon" href="/favicon.ico">
        </head>
        <body>
          <h1>Quickstart</h1>
          <section><h2>Install</h2><p>pnpm add</p></section>
        </body>
      </html>
    `;
    const fetcher = vi.fn().mockResolvedValue({ status: 200, html });
    const r = await runCheerioTrack({ url: 'https://x.com', fetcher });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.sourceTexts).toContain('docs');
    expect(r.sourceTexts).toContain('quickstart');
    expect(r.colors.primary).toBe('#123456');
    expect(r.ogImageUrl).toBe('https://cdn.example.com/og.png');
  });

  it('returns blocked when fetcher returns 403', async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 403, html: '' });
    const r = await runCheerioTrack({ url: 'https://x.com', fetcher });
    expect(r.kind).toBe('blocked');
  });
});
