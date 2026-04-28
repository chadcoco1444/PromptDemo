import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { AnimatedText } from '../../primitives/AnimatedText';

export const TextPunchPhotoBackdrop: React.FC<{ text: string; screenshotUrl: string }> = ({ text, screenshotUrl }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Slow Ken Burns: 1.0 → 1.04 over scene duration. Clamp both ends so a
  // negative local frame (preroll/Studio scrubber when wrapped in Sequence
  // with from > 0) never produces scale < 1.0 → no black border flash.
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `scale(${scale})`, filter: 'blur(3px)', opacity: 0.22 }}>
        <Img src={screenshotUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 100%)' }} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            maxWidth: 1000,
            textAlign: 'center',
            color: '#fff',
            padding: 80,
            textShadow: '0 4px 24px rgba(0,0,0,0.6)',
          }}
        >
          <AnimatedText text={text} mode="charFade" style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
