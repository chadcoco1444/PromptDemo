import { describe, it, expect } from 'vitest';
import { extractSourceTexts } from '../src/extractors/textExtractor.js';

const html = `
<html>
  <head>
    <title>Ship AI workflows</title>
    <meta name="description" content="Build and ship AI in minutes">
  </head>
  <body>
    <h1>  Automate Your Stack  </h1>
    <h2>Fast &amp; reliable</h2>
    <p>Some paragraph text that is short.</p>
    <strong>Trusted by teams</strong>
    <p>${'x'.repeat(300)}</p>
    <h1>Automate Your Stack</h1>
  </body>
</html>
`;

describe('extractSourceTexts', () => {
  it('pulls normalized title and description', () => {
    const texts = extractSourceTexts(html);
    expect(texts).toContain('ship ai workflows');
    expect(texts).toContain('build and ship ai in minutes');
  });

  it('pulls H1-H3 text normalized', () => {
    const texts = extractSourceTexts(html);
    expect(texts).toContain('automate your stack');
    // normalizeText folds " & " → " and " so source pool and Claude rewrites collide.
    expect(texts).toContain('fast and reliable');
  });

  it('pulls strong text', () => {
    const texts = extractSourceTexts(html);
    expect(texts).toContain('trusted by teams');
  });

  it('dedupes repeated text', () => {
    const texts = extractSourceTexts(html);
    expect(texts.filter((t) => t === 'automate your stack').length).toBe(1);
  });

  it('truncates entries longer than 200 chars', () => {
    const texts = extractSourceTexts(html);
    for (const t of texts) {
      expect(t.length).toBeLessThanOrEqual(200);
    }
  });

  it('returns empty array when no meaningful text', () => {
    expect(extractSourceTexts('<html><body></body></html>')).toEqual([]);
  });
});
