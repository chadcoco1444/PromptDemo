import React from 'react';

export type BgmMood = 'upbeat' | 'cinematic' | 'minimal' | 'tech' | 'none';

export interface BGMTrackProps {
  mood: BgmMood;
  durationInFrames: number;
  volume?: number;
}

// BGM disabled until the user ships mp3 files to packages/remotion/src/assets/bgm/.
// Remotion's bundler statically registers every staticFile() reference at
// bundle time; if we keep staticFile('bgm/tech.mp3') in source, Remotion will
// 404 at render even when mood='none'. Returning null unconditionally removes
// the static reference so the bundler doesn't register the asset at all.
//
// To re-enable BGM:
//   1. Drop royalty-free mp3s into packages/remotion/src/assets/bgm/
//   2. Restore the previous implementation (see git history before this commit)
//      with the conditional Audio + staticFile block.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const BGMTrack: React.FC<BGMTrackProps> = (_props) => {
  return null;
};
