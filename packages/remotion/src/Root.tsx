import React from 'react';
import { registerRoot, Composition } from 'remotion';

const Placeholder: React.FC = () => <div style={{ color: 'white' }}>placeholder</div>;

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MainComposition"
    component={Placeholder}
    durationInFrames={300}
    fps={30}
    width={1280}
    height={720}
  />
);

registerRoot(RemotionRoot);
