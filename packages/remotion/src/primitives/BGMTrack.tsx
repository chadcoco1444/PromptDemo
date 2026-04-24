import React from 'react';
import { Audio, staticFile } from 'remotion';

export type BgmMood = 'upbeat' | 'cinematic' | 'minimal' | 'tech' | 'none';

const TRACK_FILE: Record<Exclude<BgmMood, 'none'>, string> = {
  upbeat: 'bgm/upbeat.mp3',
  cinematic: 'bgm/cinematic.mp3',
  minimal: 'bgm/minimal.mp3',
  tech: 'bgm/tech.mp3',
};

export interface BGMTrackProps {
  mood: BgmMood;
  durationInFrames: number;
  volume?: number;
}

export const BGMTrack: React.FC<BGMTrackProps> = ({ mood, durationInFrames, volume = 0.25 }) => {
  if (mood === 'none') return null;
  const file = TRACK_FILE[mood];
  const fadeFrames = 20;
  return (
    <Audio
      src={staticFile(file)}
      volume={(frame) => {
        if (frame < fadeFrames) return volume * (frame / fadeFrames);
        if (frame > durationInFrames - fadeFrames) {
          return volume * ((durationInFrames - frame) / fadeFrames);
        }
        return volume;
      }}
    />
  );
};
