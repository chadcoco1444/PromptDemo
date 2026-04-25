import { describe, it, expect } from 'vitest';
import { bundle } from '@remotion/bundler';
import { getCompositions, renderMedia } from '@remotion/renderer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, statSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const GATED = process.env.REMOTION_SMOKE === 'true';

describe.skipIf(!GATED)('renderSmoke (gated behind REMOTION_SMOKE=true)', () => {
  it('renders a 10s MP4 without error', async () => {
    const entry = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'Root.tsx');
    const bundled = await bundle({ entryPoint: entry });
    const comps = await getCompositions(bundled);
    const main = comps.find((c) => c.id === 'MainComposition');
    expect(main).toBeDefined();

    const outDir = mkdtempSync(join(tmpdir(), 'lumespec-smoke-'));
    const outPath = join(outDir, 'smoke.mp4');
    try {
      await renderMedia({
        composition: {
          ...main!,
          durationInFrames: 300, // force 10s smoke regardless of fixture
        },
        serveUrl: bundled,
        codec: 'h264',
        outputLocation: outPath,
      });
      expect(existsSync(outPath)).toBe(true);
      expect(statSync(outPath).size).toBeGreaterThan(10_000);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 300_000); // up to 5 minutes on cold cache
});
