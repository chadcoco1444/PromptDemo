import { describe, it, expect } from 'vitest';
import { bundle } from '@remotion/bundler';
import { getCompositions } from '@remotion/renderer';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

describe('Remotion composition registry', () => {
  it('registers MainComposition with the expected id and fps', async () => {
    const entry = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'Root.tsx');
    const bundled = await bundle({ entryPoint: entry });
    const comps = await getCompositions(bundled);
    const main = comps.find((c) => c.id === 'MainComposition');
    expect(main).toBeDefined();
    expect(main!.fps).toBe(30);
    expect(main!.width).toBe(1280);
    expect(main!.height).toBe(720);
  }, 120_000); // bundling can take ~20-40s on first run
});
