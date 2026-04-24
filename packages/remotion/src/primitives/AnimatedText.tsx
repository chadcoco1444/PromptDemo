import React from 'react';
import { useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

export interface AnimatedTextProps {
  text: string;
  style?: React.CSSProperties;
  delayFrames?: number;
  mode?: 'wordFade' | 'charFade';
}

export const AnimatedText: React.FC<AnimatedTextProps> = ({
  text,
  style,
  delayFrames = 0,
  mode = 'wordFade',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const units = mode === 'charFade' ? [...text] : text.split(/(\s+)/);

  return (
    <span style={style}>
      {units.map((u, i) => {
        const unitDelay = delayFrames + i * 2;
        const progress = spring({
          frame: frame - unitDelay,
          fps,
          config: { damping: 20, mass: 0.5 },
        });
        const opacity = interpolate(progress, [0, 1], [0, 1]);
        const y = interpolate(progress, [0, 1], [8, 0]);
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity,
              transform: `translateY(${y}px)`,
              whiteSpace: u === ' ' ? 'pre' : undefined,
            }}
          >
            {u}
          </span>
        );
      })}
    </span>
  );
};
