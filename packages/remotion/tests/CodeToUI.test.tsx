import { describe, it, expect } from 'vitest';
import { CodeToUI } from '../src/scenes/CodeToUI.js';
import { deriveTheme } from '../src/utils/brandTheme.js';

const theme = deriveTheme('#4f46e5');
const code = `const client = new LumeSpec();\nconst video = await client.generate({\n  url: 'https://example.com',\n  duration: 30,\n});`;

describe('CodeToUI', () => {
  it('exports a function component', () => {
    expect(typeof CodeToUI).toBe('function');
  });

  it('is named CodeToUI (for Remotion DevTools)', () => {
    expect(CodeToUI.name).toBe('CodeToUI');
  });

  it('accepts props with screenshotUrl', () => {
    const props: Parameters<typeof CodeToUI>[0] = {
      code,
      language: 'javascript',
      screenshotUrl: 'http://fake/viewport.jpg',
      theme,
      durationInFrames: 300,
    };
    expect(props.code).toContain('LumeSpec');
  });

  it('accepts props without screenshotUrl (fallback branch)', () => {
    const props: Parameters<typeof CodeToUI>[0] = {
      code,
      theme,
      durationInFrames: 300,
    };
    expect(props.screenshotUrl).toBeUndefined();
  });

  it('accepts language and label props', () => {
    const props: Parameters<typeof CodeToUI>[0] = {
      code,
      language: 'typescript',
      label: 'Quick Start',
      theme,
      durationInFrames: 300,
    };
    expect(props.language).toBe('typescript');
    expect(props.label).toBe('Quick Start');
  });
});
