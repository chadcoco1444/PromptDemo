import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../src/extractors/featureExtractor.js';

const html = `
<html><body>
  <section>
    <h2>One-click data sync</h2>
    <p>Connect 40+ sources without code.</p>
    <img src="/plug.svg" alt="plug icon">
  </section>
  <section>
    <h3>Managed agents</h3>
    <p>Serverless and autoscaling.</p>
  </section>
  <section>
    <h3></h3>
  </section>
</body></html>
`;

describe('extractFeatures', () => {
  it('pairs H2/H3 with sibling paragraph', () => {
    const f = extractFeatures(html);
    expect(f).toContainEqual(expect.objectContaining({ title: 'one-click data sync', description: 'connect 40+ sources without code.' }));
  });

  it('captures iconHint from nearby img alt', () => {
    const f = extractFeatures(html);
    const match = f.find((x) => x.title === 'one-click data sync');
    expect(match?.iconHint).toBe('plug icon');
  });

  it('accepts features without description', () => {
    const f = extractFeatures('<html><body><section><h2>Auth</h2></section></body></html>');
    expect(f).toEqual([{ title: 'auth' }]);
  });

  it('skips features with empty heading', () => {
    const f = extractFeatures(html);
    expect(f.every((x) => x.title.length > 0)).toBe(true);
  });

  it('omits iconHint when img alt exceeds 100 characters', () => {
    const longAlt = 'A ' + 'very descriptive accessibility sentence about what this image shows '.repeat(2);
    const f = extractFeatures(`<html><body><section><h2>Feature</h2><img alt="${longAlt}"></section></body></html>`);
    expect(f[0]?.iconHint).toBeUndefined();
  });
});
