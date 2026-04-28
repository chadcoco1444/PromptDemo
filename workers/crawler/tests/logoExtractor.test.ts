import { describe, it, expect } from 'vitest';
import { extractLogos } from '../src/extractors/logoExtractor.js';

const BASE = 'https://example.com';

describe('extractLogos', () => {
  it('returns [] when no logo-section found', () => {
    const html = '<html><body><h1>Product</h1><p>Our great product.</p></body></html>';
    expect(extractLogos(html, BASE)).toEqual([]);
  });

  it('extracts from [class*="trusted"] container', () => {
    const html = `<html><body>
      <div class="trusted-by-section">
        <img src="https://cdn.stripe.com/logo.svg" alt="Stripe">
        <img src="https://cdn.github.com/logo.png" alt="GitHub">
      </div>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe('Stripe');
    expect(result[0]!.srcUrl).toBe('https://cdn.stripe.com/logo.svg');
    expect(result[1]!.name).toBe('GitHub');
  });

  it('extracts from heading proximity ("Trusted by our customers")', () => {
    const html = `<html><body>
      <section>
        <h2>Trusted by our customers</h2>
        <img src="https://cdn.acme.com/logo.png" alt="Acme">
      </section>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Acme');
  });

  it('resolves relative src to absolute URL using baseUrl', () => {
    const html = `<html><body>
      <div class="partner-logos">
        <img src="/logos/stripe.svg" alt="Stripe">
      </div>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(1);
    expect(result[0]!.srcUrl).toBe('https://example.com/logos/stripe.svg');
  });

  it('deduplicates by name (case-insensitive)', () => {
    const html = `<html><body>
      <div class="clients-section">
        <img src="https://a.com/1.svg" alt="Stripe">
        <img src="https://b.com/2.svg" alt="stripe">
      </div>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(1);
  });

  it('caps at 12 candidates', () => {
    const imgs = Array.from(
      { length: 20 },
      (_, i) => `<img src="https://cdn${i}.com/logo.svg" alt="Partner ${i}">`
    ).join('');
    const html = `<html><body><div class="trusted-logos">${imgs}</div></body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(12);
  });

  it('skips images with empty src', () => {
    const html = `<html><body>
      <div class="sponsor-area">
        <img src="" alt="Broken">
        <img src="https://cdn.stripe.com/logo.svg" alt="Stripe">
      </div>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Stripe');
  });

  it('derives name from src filename when alt is absent', () => {
    const html = `<html><body>
      <div class="partner-logos">
        <img src="/logos/acme-corp.svg">
      </div>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('acme corp');
    expect(result[0]!.srcUrl).toBe('https://example.com/logos/acme-corp.svg');
  });

  // Regression: 2026-04-28 stripe.com job i-GTw9pwtpmUhfXBLPw7e — Stripe's
  // customer-stories section contained marketing photos with descriptive a11y
  // alt text (>100 chars) like "Aerial view of a street intersection where the
  // crosswalks form a slanted parallelogram...". The class signal `customer*`
  // matched the section, every img's alt exceeded PartnerLogoSchema's
  // .max(100), and the ENTIRE crawl was rejected by Zod. Fix at extractor:
  // discard alt > 100 chars and fall back to filename-derived name (existing
  // fallback path for empty alt).
  it('falls back to nameFromSrc when alt > 100 chars (Stripe customer-photos regression)', () => {
    const longAlt =
      'Aerial view of a street intersection where the crosswalks form a slanted parallelogram, imitating the Stripe logo.';
    expect(longAlt.length).toBeGreaterThan(100);
    const html = `<html><body>
      <div class="customer-stories">
        <img src="https://images.example.com/road-stripe.jpg" alt="${longAlt}">
      </div>
    </body></html>`;
    const result = extractLogos(html, BASE);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('road stripe');
    expect(result[0]!.name.length).toBeLessThanOrEqual(100);
  });
});
