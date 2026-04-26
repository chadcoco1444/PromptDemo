import { describe, it, expect } from 'vitest';
import { extractCodeSnippets } from '../src/extractors/codeExtractor.js';

describe('extractCodeSnippets', () => {
  it('returns [] when no pre > code found', () => {
    const html = '<html><body><h1>Marketing page</h1><p>No code here.</p></body></html>';
    expect(extractCodeSnippets(html)).toEqual([]);
  });

  it('extracts language from class="language-javascript"', () => {
    const html = `<html><body>
      <pre><code class="language-javascript">const x = 1;\nconst y = 2;\nreturn x + y;</code></pre>
    </body></html>`;
    const result = extractCodeSnippets(html);
    expect(result).toHaveLength(1);
    expect(result[0]!.language).toBe('javascript');
    expect(result[0]!.code).toContain('const x = 1;');
  });

  it('handles lang-python prefix variant', () => {
    const html = `<html><body>
      <pre><code class="lang-python">import os\nprint(os.getcwd())\nresult = True</code></pre>
    </body></html>`;
    const result = extractCodeSnippets(html);
    expect(result).toHaveLength(1);
    expect(result[0]!.language).toBe('python');
  });

  it('extracts label from nearest h3 above the block', () => {
    const html = `<html><body>
      <h3>Quick Start</h3>
      <pre><code class="language-bash">npm install lumespec\nnpm run dev</code></pre>
    </body></html>`;
    const result = extractCodeSnippets(html);
    expect(result).toHaveLength(1);
    expect(result[0]!.label).toBe('Quick Start');
  });

  it('skips minified code (no newlines, >200 chars)', () => {
    const minified = 'x'.repeat(201);
    const html = `<html><body><pre><code>${minified}</code></pre></body></html>`;
    expect(extractCodeSnippets(html)).toEqual([]);
  });

  it('does not skip short single-line code (<=200 chars)', () => {
    const html = `<html><body><pre><code>const x = 1;</code></pre></body></html>`;
    const result = extractCodeSnippets(html);
    expect(result).toHaveLength(1);
  });

  it('truncates at 800 chars on a newline boundary', () => {
    const line = 'a'.repeat(79) + '\n'; // 80 chars per line
    const longCode = line.repeat(15); // 1200 chars total
    const html = `<html><body><pre><code>${longCode}</code></pre></body></html>`;
    const result = extractCodeSnippets(html);
    expect(result[0]!.code.length).toBeLessThanOrEqual(800);
    expect(result[0]!.code).not.toMatch(/a$/); // cut on newline boundary, last char is '\n'
  });

  it('deduplicates by first 40 chars of normalized code', () => {
    const snippet = 'const apiKey = process.env.API_KEY;\nconsole.log(apiKey);';
    const html = `<html><body>
      <pre><code>${snippet}</code></pre>
      <pre><code>${snippet}</code></pre>
    </body></html>`;
    expect(extractCodeSnippets(html)).toHaveLength(1);
  });

  it('caps at 5 snippets', () => {
    const snippets = Array.from({ length: 8 }, (_, i) =>
      `<pre><code>const unique_${i} = ${i};\nconst val = unique_${i} * 2;\nreturn val;</code></pre>`
    ).join('');
    const html = `<html><body>${snippets}</body></html>`;
    expect(extractCodeSnippets(html)).toHaveLength(5);
  });
});
