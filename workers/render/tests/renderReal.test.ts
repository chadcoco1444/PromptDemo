import { describe, it, expect } from 'vitest';
import { renderComposition, defaultSdk } from '../src/renderer.js';
import { withTempDir } from '../src/tempDir.js';
import { fileURLToPath } from 'node:url';
import storyboard30s from '@promptdemo/schema/fixtures/storyboard.30s.json';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const GATED = process.env.RENDER_INTEGRATION === 'true';

describe.skipIf(!GATED)('real Remotion render (RENDER_INTEGRATION=true)', () => {
  it('renders a 10s MP4 using the 30s fixture (override duration to 300 frames)', async () => {
    const entry = fileURLToPath(
      new URL('../../../packages/remotion/src/Root.tsx', import.meta.url)
    );
    const sdk = await defaultSdk();
    await withTempDir('promptdemo-render-int-', async (dir) => {
      const output = join(dir, 'smoke.mp4');
      const shortened = { ...(storyboard30s as any), videoConfig: { ...(storyboard30s as any).videoConfig, durationInFrames: 300 } };
      await renderComposition({
        entryPoint: entry,
        compositionId: 'MainComposition',
        inputProps: {
          ...shortened,
          sourceUrl: 'https://example-saas.com',
          resolverEndpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
          forcePathStyle: true,
        },
        outputPath: output,
        codec: 'h264',
        sdk,
      });
      const size = statSync(output).size;
      expect(size).toBeGreaterThan(10_000);
    });
  }, 600_000);
});
