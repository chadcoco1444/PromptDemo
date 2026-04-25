import { describe, it, expect } from 'vitest';
import { detectIndustry, STYLE_MODIFIERS } from '../src/prompts/industryDetect.js';
import type { CrawlResult } from '@promptdemo/schema';

// Minimal fixture — extend only the fields detectIndustry actually reads
function make(overrides: {
  sourceTexts?: string[];
  features?: Array<{ title: string; description?: string }>;
}): CrawlResult {
  return {
    brand: { name: 'Acme', primaryColor: '#7c3aed' },
    screenshots: {},
    sourceTexts: overrides.sourceTexts ?? ['A product for modern teams'],
    features: (overrides.features ?? []) as CrawlResult['features'],
    tier: 'A',
    trackUsed: false,
  } as unknown as CrawlResult;
}

describe('detectIndustry', () => {
  it('detects developer_tool when sourceTexts contain "api"', () => {
    expect(detectIndustry(make({ sourceTexts: ['Powerful API for developers'] }))).toBe('developer_tool');
  });

  it('detects developer_tool when sourceTexts contain "sdk"', () => {
    expect(detectIndustry(make({ sourceTexts: ['Install via npm, SDK included'] }))).toBe('developer_tool');
  });

  it('detects developer_tool from feature description containing "webhook"', () => {
    expect(detectIndustry(make({
      features: [{ title: 'Webhooks', description: 'webhook delivery for every event' }],
    }))).toBe('developer_tool');
  });

  it('detects ecommerce when sourceTexts contain price pattern $N', () => {
    expect(detectIndustry(make({ sourceTexts: ['Only $29.99 per month'] }))).toBe('ecommerce');
  });

  it('detects ecommerce when sourceTexts contain "cart"', () => {
    expect(detectIndustry(make({ sourceTexts: ['Add to cart and save'] }))).toBe('ecommerce');
  });

  it('detects ecommerce when sourceTexts contain "checkout"', () => {
    expect(detectIndustry(make({ sourceTexts: ['Fast checkout experience'] }))).toBe('ecommerce');
  });

  it('developer_tool wins over ecommerce when both signals present', () => {
    expect(detectIndustry(make({
      sourceTexts: ['$19 per month', 'REST API available for all plans'],
    }))).toBe('developer_tool');
  });

  it('detects saas_tool when 3+ features and no other signals', () => {
    expect(detectIndustry(make({
      features: [
        { title: 'Dashboards', description: 'Real-time metrics' },
        { title: 'Integrations', description: 'Connect your tools' },
        { title: 'Reporting', description: 'Export reports' },
      ],
      sourceTexts: ['Streamline your workflow'],
    }))).toBe('saas_tool');
  });

  it('detects content_media for 0 features + long paragraphs', () => {
    const longText =
      'This is a very long article about technology innovation spanning many words and ideas ' +
      'continuing across the page with detailed analysis and thoughtful commentary throughout.';
    expect(detectIndustry(make({
      features: [],
      sourceTexts: [longText, longText],
    }))).toBe('content_media');
  });

  it('falls back to default when signals are ambiguous', () => {
    expect(detectIndustry(make({
      features: [{ title: 'One feature', description: 'Something' }],
      sourceTexts: ['Short text'],
    }))).toBe('default');
  });
});

describe('STYLE_MODIFIERS', () => {
  it('returns empty string for default', () => {
    expect(STYLE_MODIFIERS['default']).toBe('');
  });

  it('mentions CursorDemo for developer_tool', () => {
    expect(STYLE_MODIFIERS['developer_tool']).toContain('CursorDemo');
  });

  it('mentions BentoGrid for saas_tool', () => {
    expect(STYLE_MODIFIERS['saas_tool']).toContain('BentoGrid');
  });

  it('mentions SmoothScroll for ecommerce', () => {
    expect(STYLE_MODIFIERS['ecommerce']).toContain('SmoothScroll');
  });
});
