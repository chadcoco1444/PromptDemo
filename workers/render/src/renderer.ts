import type { Storyboard } from '@promptdemo/schema';

export interface RendererSdk {
  bundle(opts: { entryPoint: string }): Promise<string>;
  getCompositions(
    bundled: string
  ): Promise<Array<{ id: string; durationInFrames: number; fps: number; width: number; height: number }>>;
  renderMedia(opts: {
    composition: { id: string; durationInFrames: number; fps: number; width: number; height: number };
    serveUrl: string;
    codec: 'h264';
    outputLocation: string;
    inputProps: unknown;
  }): Promise<unknown>;
}

export interface RenderInput {
  entryPoint: string;
  compositionId: string;
  inputProps: Storyboard & { sourceUrl: string; resolverEndpoint: string; forcePathStyle: boolean };
  outputPath: string;
  codec: 'h264';
  sdk: RendererSdk;
}

export async function renderComposition(input: RenderInput): Promise<void> {
  const bundled = await input.sdk.bundle({ entryPoint: input.entryPoint });
  const comps = await input.sdk.getCompositions(bundled);
  const comp = comps.find((c) => c.id === input.compositionId);
  if (!comp) throw new Error(`composition id not found: ${input.compositionId}`);
  // Override durationInFrames with inputProps (client can change video length per job)
  const composition = {
    ...comp,
    durationInFrames: input.inputProps.videoConfig.durationInFrames,
  };
  await input.sdk.renderMedia({
    composition,
    serveUrl: bundled,
    codec: input.codec,
    outputLocation: input.outputPath,
    inputProps: input.inputProps,
  });
}

// Default SDK adapter binding to real Remotion packages (unit tests use a mock instead)
export async function defaultSdk(): Promise<RendererSdk> {
  const [{ bundle }, { getCompositions, renderMedia }] = await Promise.all([
    import('@remotion/bundler'),
    import('@remotion/renderer'),
  ]);
  return {
    bundle: (opts) => bundle(opts),
    getCompositions: (s) => getCompositions(s) as any,
    renderMedia: (opts) => renderMedia(opts as any),
  };
}
