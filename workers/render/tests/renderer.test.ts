import { describe, it, expect, vi } from 'vitest';
import { renderComposition } from '../src/renderer.js';

describe('renderComposition', () => {
  it('bundles entry, picks MainComposition, renders to outputPath', async () => {
    const bundle = vi.fn().mockResolvedValue('/tmp/bundle');
    const getCompositions = vi
      .fn()
      .mockResolvedValue([
        { id: 'MainComposition', durationInFrames: 900, fps: 30, width: 1280, height: 720 },
      ]);
    const renderMedia = vi.fn().mockResolvedValue(undefined);

    await renderComposition({
      entryPoint: '/src/Root.tsx',
      compositionId: 'MainComposition',
      inputProps: { videoConfig: { durationInFrames: 900, fps: 30 } } as any,
      outputPath: '/tmp/out.mp4',
      codec: 'h264',
      sdk: { bundle, getCompositions, renderMedia },
    });

    expect(bundle).toHaveBeenCalledWith(expect.objectContaining({ entryPoint: '/src/Root.tsx' }));
    expect(renderMedia).toHaveBeenCalledWith(
      expect.objectContaining({ outputLocation: '/tmp/out.mp4', codec: 'h264' })
    );
  });

  it('throws if MainComposition id not found', async () => {
    const sdk = {
      bundle: vi.fn().mockResolvedValue('/b'),
      getCompositions: vi.fn().mockResolvedValue([{ id: 'Other', durationInFrames: 1, fps: 30, width: 1, height: 1 }]),
      renderMedia: vi.fn(),
    };
    await expect(
      renderComposition({
        entryPoint: '/s.tsx',
        compositionId: 'MainComposition',
        inputProps: {} as any,
        outputPath: '/o.mp4',
        codec: 'h264',
        sdk,
      })
    ).rejects.toThrow(/MainComposition/);
    expect(sdk.renderMedia).not.toHaveBeenCalled();
  });
});
