import type { Storyboard } from '@promptdemo/schema';

export interface RendererSdk {
  bundle(opts: { entryPoint: string }): Promise<string>;
  getCompositions(
    bundled: string,
    opts?: { inputProps?: unknown }
  ): Promise<
    Array<{ id: string; durationInFrames: number; fps: number; width: number; height: number; defaultProps?: unknown }>
  >;
  renderMedia(opts: {
    composition: {
      id: string;
      durationInFrames: number;
      fps: number;
      width: number;
      height: number;
      defaultProps?: unknown;
    };
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
  // Pass inputProps to getCompositions too — Remotion 4.x may use composition's
  // defaultProps as the base; giving it our inputProps here ensures the
  // returned composition metadata reflects the actual render configuration.
  const comps = await input.sdk.getCompositions(bundled, { inputProps: input.inputProps });
  const comp = comps.find((c) => c.id === input.compositionId);
  if (!comp) throw new Error(`composition id not found: ${input.compositionId}`);
  // Override both durationInFrames AND defaultProps. The defaultProps override
  // is belt-and-braces for Remotion 4.x's inputProps/defaultProps merge quirk:
  // MainComposition will read props from defaultProps (which we overwrite to
  // equal our inputProps) regardless of how renderMedia chooses to merge.
  const composition = {
    ...comp,
    durationInFrames: input.inputProps.videoConfig.durationInFrames,
    defaultProps: input.inputProps,
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
    getCompositions: (s, o) => getCompositions(s, o as any) as any,
    renderMedia: (opts) => renderMedia(opts as any),
  };
}
