import React from 'react';
import { Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { BrandTheme } from '../../utils/brandTheme';

export interface KenBurnsPanelProps {
  src: string;
  theme: BrandTheme;
  /** 0 = start of scene; values outside [0, durationInFrames] clamp. */
  startFrame?: number;
}

const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 360;
// Render the image at 2x panel height so there is room to pan vertically.
const IMG_HEIGHT_MULTIPLIER = 2;

export const KenBurnsPanel: React.FC<KenBurnsPanelProps> = ({ src, theme, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const local = Math.max(0, frame - startFrame);
  const duration = Math.max(1, durationInFrames - startFrame);
  const progress = Math.min(1, local / duration);

  const scale = interpolate(progress, [0, 1], [1.0, 1.15], { extrapolateRight: 'clamp' });
  // translateY in pixels relative to the clipping container. Pan sweeps the image
  // upward so the viewer sees top → bottom of the fullPage over the scene.
  // 0 at start → -(overflow) at end. overflow = IMG_HEIGHT - PANEL_HEIGHT.
  const overflow = PANEL_HEIGHT * (IMG_HEIGHT_MULTIPLIER - 1);
  const translateY = interpolate(progress, [0, 1], [0, -overflow], { extrapolateRight: 'clamp' });

  return (
    <div
      style={{
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 30px 60px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.08)',
        background: theme.primaryDark,
        position: 'relative',
      }}
    >
      <Img
        src={src}
        style={{
          width: '100%',
          height: `${PANEL_HEIGHT * IMG_HEIGHT_MULTIPLIER}px`,
          objectFit: 'cover',
          // Single compound transform = single GPU compositor pass per frame.
          // translate3d() promotes the layer; scale() compounds with zero layout cost.
          transform: `translate3d(0, ${translateY}px, 0) scale(${scale})`,
          transformOrigin: 'center top',
          willChange: 'transform',
          display: 'block',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.18), transparent 40%, rgba(0,0,0,0.18))',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};
