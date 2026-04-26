import { describe, it, expect } from 'vitest';
import { extractReviews } from '../src/extractors/reviewExtractor.js';

describe('extractReviews', () => {
  it('returns empty array when no review markers found', () => {
    expect(extractReviews('<html><body><h1>No reviews here</h1></body></html>')).toEqual([]);
  });

  it('extracts from blockquote with cite author', () => {
    const html = `<html><body>
      <blockquote>
        <p>This product changed how our team works.</p>
        <cite>Jane Doe</cite>
      </blockquote>
    </body></html>`;
    const reviews = extractReviews(html);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.text).toContain('changed how our team works');
    expect(reviews[0]!.author).toBe('jane doe');
  });

  it('extracts from [class*="testimonial"] with nested p and author', () => {
    const html = `<html><body>
      <div class="testimonial-card">
        <p>Incredible product, saved us hours every week.</p>
        <span class="author-name">John Smith</span>
        <span class="author-role">CTO, Acme Corp</span>
      </div>
    </body></html>`;
    const reviews = extractReviews(html);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.text).toContain('saved us hours');
    expect(reviews[0]!.author).toBe('john smith');
    expect(reviews[0]!.role).toBe('cto, acme corp');
  });

  it('extracts from schema.org [itemtype*="Review"]', () => {
    const html = `<html><body>
      <div itemtype="https://schema.org/Review">
        <span itemprop="reviewBody">Best tool I have used in years.</span>
        <span itemprop="author">Alice</span>
      </div>
    </body></html>`;
    const reviews = extractReviews(html);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]!.text).toContain('best tool');
    expect(reviews[0]!.author).toBe('alice');
  });

  it('deduplicates identical review text', () => {
    const html = `<html><body>
      <blockquote><p>Love it so much every day.</p></blockquote>
      <blockquote><p>Love it so much every day.</p></blockquote>
    </body></html>`;
    expect(extractReviews(html)).toHaveLength(1);
  });

  it('skips reviews whose text is shorter than 10 characters', () => {
    const html = `<html><body>
      <blockquote><p>Too short</p></blockquote>
      <blockquote><p>This is long enough to qualify as a testimonial quote.</p></blockquote>
    </body></html>`;
    const reviews = extractReviews(html);
    expect(reviews).toHaveLength(1);
  });

  it('caps output at 10 reviews', () => {
    const items = Array.from(
      { length: 15 },
      (_, i) => `<blockquote><p>Review number ${i + 1} is a great testimonial about this product.</p></blockquote>`
    ).join('');
    const html = `<html><body>${items}</body></html>`;
    expect(extractReviews(html).length).toBeLessThanOrEqual(10);
  });

  it('truncates text to 500 characters', () => {
    const longText = 'a '.repeat(300); // 600 chars
    const html = `<html><body><blockquote><p>${longText}</p></blockquote></body></html>`;
    const reviews = extractReviews(html);
    expect(reviews[0]!.text.length).toBeLessThanOrEqual(500);
  });

  it('extracts multiple distinct reviews', () => {
    const html = `<html><body>
      <div class="review-card"><p>First reviewer loved the onboarding experience.</p><span class="author-name">Alex</span></div>
      <div class="review-card"><p>Second reviewer praised the customer support team greatly.</p><span class="author-name">Sam</span></div>
    </body></html>`;
    const reviews = extractReviews(html);
    expect(reviews).toHaveLength(2);
  });
});
