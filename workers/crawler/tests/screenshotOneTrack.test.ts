import { describe, it, expect, vi } from 'vitest';
import { runScreenshotOneTrack } from '../src/tracks/screenshotOneTrack.js';

describe('runScreenshotOneTrack', () => {
  it('returns ok with html + screenshot bytes when api succeeds', async () => {
    const jpegHead = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    const htmlHead = Buffer.from('<html><body><title>Hi</title><h1>Hello</h1></body></html>');
    const adapter = {
      fetchScreenshot: vi.fn().mockResolvedValue(jpegHead),
      fetchHtml: vi.fn().mockResolvedValue(htmlHead.toString('utf8')),
    };
    const r = await runScreenshotOneTrack({ url: 'https://x', accessKey: 'k', adapter });
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.viewportScreenshot.equals(jpegHead)).toBe(true);
    expect(r.sourceTexts).toContain('hello');
  });

  it('returns error when api rejects', async () => {
    const adapter = {
      fetchScreenshot: vi.fn().mockRejectedValue(new Error('429 rate limited')),
      fetchHtml: vi.fn(),
    };
    const r = await runScreenshotOneTrack({ url: 'https://x', accessKey: 'k', adapter });
    expect(r.kind).toBe('error');
  });
});
