import React from 'react';
import { registerRoot, Composition } from 'remotion';
import { MainComposition, type MainCompositionProps } from './MainComposition.js';
import defaultStoryboard from '@promptdemo/schema/fixtures/storyboard.30s.json' with { type: 'json' };
import type { Storyboard } from '@promptdemo/schema';

const defaults = defaultStoryboard as unknown as Storyboard;

const defaultProps: MainCompositionProps = {
  ...defaults,
  sourceUrl: 'https://example-saas.com',
  resolverEndpoint: process.env.REMOTION_S3_ENDPOINT ?? 'http://localhost:9000',
  forcePathStyle: true,
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MainComposition"
      component={MainComposition as unknown as React.ComponentType<Record<string, unknown>>}
      durationInFrames={defaults.videoConfig.durationInFrames}
      fps={defaults.videoConfig.fps}
      width={1280}
      height={720}
      defaultProps={defaultProps as unknown as Record<string, unknown>}
    />
  </>
);

registerRoot(RemotionRoot);
