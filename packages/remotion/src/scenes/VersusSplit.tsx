import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export interface VersusSplitProps {
  headline?: string;
  compareFraming: 'before-after' | 'them-us' | 'old-new' | 'slow-fast';
  left: { label: string; value: string; iconHint?: string | undefined };
  right: { label: string; value: string; iconHint?: string | undefined };
  theme: BrandTheme;
}

// Animation timing — diagonal-progression: left animates earlier than right
// to build anticipation for the right-side reveal (English reading direction).
// Total entry ~32 frames at 30fps. Assumes scene durationInFrames >= 90.
const HEADLINE_FADE_IN = [4, 12] as const;
const LEFT_LABEL_FADE_IN = [8, 18] as const;
const LEFT_ICON_FADE_IN = [12, 22] as const;
const LEFT_VALUE_FADE_IN = [16, 28] as const;
const RIGHT_LABEL_FADE_IN = [12, 22] as const;
const RIGHT_ICON_FADE_IN = [16, 26] as const;
const RIGHT_VALUE_FADE_IN = [20, 32] as const;

export const VersusSplit: React.FC<VersusSplitProps> = ({
  headline,
  left,
  right,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const bgScale = interpolate(frame, [0, durationInFrames], [1.0, 1.02], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const headlineOpacity = interpolate(frame, [...HEADLINE_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const leftLabelOpacity = interpolate(frame, [...LEFT_LABEL_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const leftIconOpacity = interpolate(frame, [...LEFT_ICON_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const leftValueOpacity = interpolate(frame, [...LEFT_VALUE_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const leftValueY = interpolate(frame, [...LEFT_VALUE_FADE_IN], [12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const rightLabelOpacity = interpolate(frame, [...RIGHT_LABEL_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rightIconOpacity = interpolate(frame, [...RIGHT_ICON_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rightValueOpacity = interpolate(frame, [...RIGHT_VALUE_FADE_IN], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const rightValueY = interpolate(frame, [...RIGHT_VALUE_FADE_IN], [12, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ background: '#0d0d1a', transform: `scale(${bgScale})` }}>
      {headline && (
        <div
          style={{
            position: 'absolute',
            top: 90,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 32,
            fontWeight: 600,
            color: '#fff',
            opacity: headlineOpacity * 0.6,
            letterSpacing: 1,
          }}
        >
          {headline}
        </div>
      )}

      {/* Left half — desaturated dark */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          right: '50%',
          background: 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 200,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 600,
            color: '#9ca3af',
            opacity: leftLabelOpacity,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          {left.label}
        </div>
        {left.iconHint && (
          <div
            style={{
              position: 'absolute',
              top: '40%',
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 100,
              opacity: leftIconOpacity * 0.6,
              filter: 'grayscale(1)',
            }}
          >
            {left.iconHint}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            top: '70%',
            left: 40,
            right: 40,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 56,
            fontWeight: 700,
            color: '#fff',
            opacity: leftValueOpacity,
            transform: `translateY(${leftValueY}px)`,
            lineHeight: 1.15,
          }}
        >
          {left.value}
        </div>
      </div>

      {/* Vertical brand-color divider */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 'calc(50% - 2px)',
          width: 4,
          background: theme.primary,
          opacity: 0.7,
        }}
      />

      {/* Right half — full brand color */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          left: '50%',
          background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark} 100%)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 200,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 28,
            fontWeight: 600,
            color: theme.textOn,
            opacity: rightLabelOpacity,
            letterSpacing: 3,
            textTransform: 'uppercase',
          }}
        >
          {right.label}
        </div>
        {right.iconHint && (
          <div
            style={{
              position: 'absolute',
              top: '40%',
              left: 0,
              right: 0,
              textAlign: 'center',
              fontSize: 100,
              color: theme.textOn,
              opacity: rightIconOpacity * 0.8,
            }}
          >
            {right.iconHint}
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            top: '70%',
            left: 40,
            right: 40,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 56,
            fontWeight: 700,
            color: theme.textOn,
            opacity: rightValueOpacity,
            transform: `translateY(${rightValueY}px)`,
            lineHeight: 1.15,
          }}
        >
          {right.value}
        </div>
      </div>
    </AbsoluteFill>
  );
};
