import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { BrowserChrome } from '../primitives/BrowserChrome';
import type { BrandTheme } from '../utils/brandTheme';

export interface SmoothScrollProps {
  screenshotUrl: string;
  url: string;
  speed: 'slow' | 'medium' | 'fast';
  theme: BrandTheme;
}

const SPEED_MULTIPLIER: Record<SmoothScrollProps['speed'], number> = {
  slow: 0.6,
  medium: 1,
  fast: 1.6,
};

export const SmoothScroll: React.FC<SmoothScrollProps> = ({ screenshotUrl, url, speed, theme }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const scrollDistance = 2000 * SPEED_MULTIPLIER[speed];
  const offset = interpolate(frame, [0, durationInFrames], [0, -scrollDistance], {
    extrapolateRight: 'clamp',
  });
  return (
    <AbsoluteFill
      style={{ background: theme.primaryDark, alignItems: 'center', justifyContent: 'center', padding: 80 }}
    >
      <BrowserChrome url={url} style={{ width: 1000, height: 560 }}>
        <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
          <Img
            src={screenshotUrl}
            style={{
              width: '100%',
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `translateY(${offset}px)`,
              willChange: 'transform',
            }}
          />
        </div>
      </BrowserChrome>
    </AbsoluteFill>
  );
};
