import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export const REGION_COORDS: Record<string, { x: number; y: number }> = {
  'top-left':    { x: 0.10, y: 0.15 },
  'top':         { x: 0.50, y: 0.15 },
  'top-right':   { x: 0.90, y: 0.15 },
  'left':        { x: 0.10, y: 0.50 },
  'center':      { x: 0.50, y: 0.50 },
  'right':       { x: 0.90, y: 0.50 },
  'bottom-left': { x: 0.10, y: 0.85 },
  'bottom':      { x: 0.50, y: 0.85 },
  'bottom-right':{ x: 0.90, y: 0.85 },
};

export function bezierQuad(t: number, p0: number, p1: number, p2: number): number {
  return (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
}

export interface CursorDemoProps {
  action: 'Click' | 'Scroll' | 'Hover' | 'Type';
  targetHint: { region: string };
  targetDescription: string;
  screenshotUrl?: string;
  durationInFrames: number;
  theme: BrandTheme;
}

const W = 1920;
const H = 1080;

// Cursor starts off-screen bottom-left, arcs to target via quadratic Bezier
const START_X = -0.05;
const START_Y = 1.10;
const CTRL_X = 0.28;
const CTRL_Y = 0.42;

export const CursorDemo: React.FC<CursorDemoProps> = ({
  action,
  targetHint,
  targetDescription,
  screenshotUrl,
  durationInFrames,
  theme,
}) => {
  const frame = useCurrentFrame();
  const target = REGION_COORDS[targetHint.region] ?? REGION_COORDS['center'];

  const moveEnd = Math.floor(durationInFrames * 0.4);
  const actionStart = moveEnd;
  const actionEnd = durationInFrames;

  // Movement phase: t goes 0→1 over first 40% of scene
  const t = interpolate(frame, [0, moveEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cursorX = bezierQuad(t, START_X, CTRL_X, target.x) * W;
  const cursorY = bezierQuad(t, START_Y, CTRL_Y, target.y) * H;

  const actionFrame = Math.max(0, frame - actionStart);
  const actionDuration = actionEnd - actionStart;

  // Click: ripple ring expands and fades over 18 frames
  const rippleProgress =
    action === 'Click' && frame >= actionStart
      ? interpolate(actionFrame, [0, 18], [0, 1], { extrapolateRight: 'clamp' })
      : 0;

  // Hover: cursor pulse scale — 2 full cycles over action duration
  const hoverScale =
    action === 'Hover'
      ? 1 + 0.15 * Math.sin((actionFrame / Math.max(1, actionDuration)) * Math.PI * 4)
      : 1;

  // Scroll: cursor drifts up 40px
  const scrollDrift =
    action === 'Scroll'
      ? interpolate(actionFrame, [0, actionDuration], [0, -40], {
          extrapolateRight: 'clamp',
        })
      : 0;

  // Type: reveal one character every 3 frames (cursor blinks at 15fps half-cycle)
  const charsVisible = action === 'Type' ? Math.floor(actionFrame / 3) : 0;
  const typedText = targetDescription.slice(0, charsVisible);
  const cursorBlink = frame % 30 < 15;

  return (
    <AbsoluteFill style={{ background: '#0a0a0a', overflow: 'hidden' }}>
      {screenshotUrl && (
        <Img
          src={screenshotUrl}
          style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.55 }}
        />
      )}

      {/* SVG cursor */}
      <div
        style={{
          position: 'absolute',
          left: cursorX,
          top: cursorY + scrollDrift,
          transform: `scale(${hoverScale})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.6))',
        }}
      >
        <svg width="36" height="44" viewBox="0 0 36 44" fill="none">
          <path
            d="M4 2L4 34L14 24L20 40L25 37.5L19 21.5L32 21.5L4 2Z"
            fill="white"
            stroke="#222"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Click ripple */}
      {action === 'Click' && frame >= actionStart && rippleProgress > 0 && (
        <div
          style={{
            position: 'absolute',
            left: target.x * W,
            top: target.y * H,
            width: 60 + 100 * rippleProgress,
            height: 60 + 100 * rippleProgress,
            borderRadius: '50%',
            border: `3px solid ${theme.primary}`,
            opacity: 1 - rippleProgress,
            transform: 'translate(-50%, -50%)',
          }}
        />
      )}

      {/* Type label */}
      {action === 'Type' && typedText && (
        <div
          style={{
            position: 'absolute',
            left: target.x * W + 44,
            top: target.y * H + 44,
            background: 'rgba(0,0,0,0.85)',
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: 8,
            fontSize: 20,
            fontFamily: 'monospace',
            maxWidth: 400,
            whiteSpace: 'pre-wrap',
          }}
        >
          {typedText}
          <span style={{ opacity: cursorBlink ? 1 : 0 }}>|</span>
        </div>
      )}
    </AbsoluteFill>
  );
};
