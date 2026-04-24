import React from 'react';
import { Img, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import type { BrandTheme } from '../../utils/brandTheme';

export interface CollagePanelProps {
  src: string;
  theme: BrandTheme;
}

const PANEL_HEIGHT = 360;
// Render each slice's <Img> at 3x panel height so we can crop a different region by translation.
const IMG_HEIGHT_MULTIPLIER = 3;
const IMG_HEIGHT = PANEL_HEIGHT * IMG_HEIGHT_MULTIPLIER;

const SLICES = [
  { yOffset: 0.0 },   // top slice
  { yOffset: 0.4 },   // middle slice
  { yOffset: 0.85 },  // bottom slice (clamped: 0.85 * (IMG_HEIGHT - PANEL_HEIGHT))
];

export const CollagePanel: React.FC<CollagePanelProps> = ({ src, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const maxTranslate = IMG_HEIGHT - PANEL_HEIGHT; // crop window travel distance

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        width: 580,
        height: PANEL_HEIGHT,
        position: 'relative',
      }}
    >
      {SLICES.map((slice, i) => {
        const delayFrames = i * 4;
        const progress = spring({
          frame: Math.max(0, frame - delayFrames),
          fps,
          config: { damping: 14, stiffness: 110 },
        });
        const translateX = interpolate(progress, [0, 1], [40, 0]);
        // Per-slice static Y-offset: negative pixels to pull the image up so the
        // slice's target region is visible through the container's overflow clip.
        const sliceTranslateY = -(slice.yOffset * maxTranslate);
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: 10,
              overflow: 'hidden',
              boxShadow: '0 20px 40px rgba(0,0,0,0.24), inset 0 0 0 1px rgba(255,255,255,0.08)',
              background: theme.primaryDark,
              opacity: progress,
              transform: `translate3d(${translateX}px, 0, 0)`,
              willChange: 'transform, opacity',
            }}
          >
            <Img
              src={src}
              style={{
                width: '100%',
                height: `${IMG_HEIGHT}px`,
                objectFit: 'cover',
                // Static transform — baked per-slice, no per-frame recompute.
                transform: `translate3d(0, ${sliceTranslateY}px, 0)`,
                transformOrigin: 'center top',
                display: 'block',
              }}
            />
          </div>
        );
      })}
    </div>
  );
};
