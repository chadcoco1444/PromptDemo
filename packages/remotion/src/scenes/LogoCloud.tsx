import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export interface LogoCloudProps {
  logos: Array<{ name: string; resolvedUrl: string }>;
  speed: 'slow' | 'medium' | 'fast';
  label?: string;
  theme: BrandTheme;
  durationInFrames: number;
}

const SPEED_PX_PER_FRAME: Record<'slow' | 'medium' | 'fast', number> = { slow: 1.5, medium: 3, fast: 5 };
const SLOT_WIDTH = 200;

export const LogoCloud: React.FC<LogoCloudProps> = ({
  logos,
  speed,
  label,
  theme,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  // 3x duplication creates a seamless loop.
  const items = [...logos, ...logos, ...logos];
  const singleWidth = logos.length * SLOT_WIDTH;
  const pxPerFrame = SPEED_PX_PER_FRAME[speed];

  const offset = (frame * pxPerFrame) % singleWidth;

  const fadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  // Suppress unused variable warnings for theme and durationInFrames.
  // They are part of the standard scene prop contract and will be used later.
  void theme;
  void durationInFrames;

  return (
    <AbsoluteFill
      style={{
        background: '#0a0a0a',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 32,
        overflow: 'hidden',
        opacity: fadeIn,
      }}
    >
      {label && (
        <div
          style={{
            color: 'rgba(255,255,255,0.7)',
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: '0.04em',
            textAlign: 'center',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {label}
        </div>
      )}

      {/* Fade masks */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(to right, #0a0a0a 0%, transparent 14%, transparent 86%, #0a0a0a 100%)',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      />

      {/* Scrolling strip */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          transform: `translateX(${-offset}px)`,
          alignItems: 'center',
          willChange: 'transform',
          flexShrink: 0,
        }}
      >
        {items.map((logo, i) => (
          <LogoSlot key={i} logo={logo} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

interface LogoSlotProps {
  logo: { name: string; resolvedUrl: string };
}

const LogoSlot: React.FC<LogoSlotProps> = ({ logo }) => (
  <div
    style={{
      width: SLOT_WIDTH,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <div
      style={{
        width: 168,
        height: 72,
        background: 'rgba(255,255,255,0.95)',
        border: '1px solid rgba(0,0,0,0.06)',
        borderRadius: 12,
        boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <Img
        src={logo.resolvedUrl}
        style={{ maxWidth: 140, maxHeight: 48, objectFit: 'contain' }}
      />
    </div>
  </div>
);
