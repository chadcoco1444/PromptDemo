import React from 'react';
import { AbsoluteFill } from 'remotion';
import { TransitionSeries } from '@remotion/transitions';
import type { Storyboard } from '@lumespec/schema';
import { deriveTheme } from './utils/brandTheme';
import { makeS3Resolver } from './s3Resolver';
import { resolveScene } from './resolveScene';
import { BGMTrack } from './primitives/BGMTrack';
import { toPresentation } from './animations/entryExit';
import { defaultTransitionTiming } from './animations/timing';
import { Watermark } from './primitives/Watermark';

const TRANSITION_FRAMES = 15;

export interface MainCompositionProps extends Storyboard {
  sourceUrl: string;
  resolverEndpoint: string;
  forcePathStyle: boolean;
}

export const MainComposition: React.FC<MainCompositionProps> = ({
  videoConfig,
  assets,
  scenes,
  sourceUrl,
  resolverEndpoint,
  forcePathStyle,
}) => {
  const theme = deriveTheme(videoConfig.brandColor);
  const resolver = makeS3Resolver({ endpoint: resolverEndpoint, forcePathStyle });
  const logoUrl = resolver(videoConfig.logoUrl);

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <BGMTrack mood={videoConfig.bgm} durationInFrames={videoConfig.durationInFrames} />
      <TransitionSeries>
        {scenes.map((scene, i) => {
          const sceneEl = resolveScene({
            scene,
            assets,
            theme,
            url: sourceUrl,
            ...(logoUrl ? { logoUrl } : {}),
            resolver,
          });
          // Non-last sequences need TRANSITION_FRAMES extra so that after the
          // TransitionSeries subtracts (N-1)×TRANSITION_FRAMES of overlap the
          // total rendered duration equals videoConfig.durationInFrames.
          const seqDuration =
            i < scenes.length - 1
              ? scene.durationInFrames + TRANSITION_FRAMES
              : scene.durationInFrames;
          const seq = (
            <TransitionSeries.Sequence key={`seq-${scene.sceneId}`} durationInFrames={seqDuration}>
              {sceneEl}
            </TransitionSeries.Sequence>
          );
          if (i === scenes.length - 1) return seq;
          const nextScene = scenes[i + 1]!;
          const presentation = toPresentation(nextScene.entryAnimation);
          return (
            <React.Fragment key={scene.sceneId}>
              {seq}
              <TransitionSeries.Transition
                key={`tr-${scene.sceneId}`}
                // @ts-expect-error — presentation component comes from @remotion/transitions opaque type
                presentation={presentation.component}
                timing={defaultTransitionTiming(TRANSITION_FRAMES)}
              />
            </React.Fragment>
          );
        })}
      </TransitionSeries>
      {videoConfig.showWatermark && <Watermark />}
    </AbsoluteFill>
  );
};
