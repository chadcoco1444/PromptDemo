import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import type { BrandTheme } from '../../utils/brandTheme';

type Emphasis = 'primary' | 'secondary' | 'neutral';

export const TextPunchSlideBlock: React.FC<{ text: string; emphasis: Emphasis; theme: BrandTheme }> = ({
  text,
  emphasis,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const bg =
    emphasis === 'primary' ? theme.primary : emphasis === 'secondary' ? theme.primaryDark : '#111';
  const color = emphasis === 'neutral' ? '#fff' : theme.textOn;

  // Block slides in from right (~12 frames spring), holds, slides out left (final 8 frames).
  const enterProgress = spring({ frame, fps, config: { mass: 1, damping: 18, stiffness: 80 } });
  const exitStart = durationInFrames - 8;
  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const enterX = interpolate(enterProgress, [0, 1], [100, 0]);
  const exitX = interpolate(exitProgress, [0, 1], [0, -100]);
  const finalX = exitProgress > 0 ? exitX : enterX;

  // Text fades in 4 frames after block stops moving. Uses plain div (not
  // AnimatedText charFade) — slide motion already reads as "newness", per-char
  // stagger would compete with the slide direction.
  const textOpacity = interpolate(frame, [12, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `translateX(${finalX}%)`, background: bg }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: textOpacity,
          }}
        >
          <div style={{ maxWidth: 1000, textAlign: 'center', color, padding: 80 }}>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }}>{text}</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
