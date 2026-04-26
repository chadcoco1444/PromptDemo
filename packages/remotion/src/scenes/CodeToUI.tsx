import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate, spring } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export interface CodeToUIProps {
  code: string;
  language?: string;
  label?: string;
  screenshotUrl?: string;
  theme: BrandTheme;
  durationInFrames: number;
}

// Typewriter reveal: frames 20–95 (75 frames)
const TYPE_START = 20;
const TYPE_END = 95;

// Screenshot spring entry starts at frame 85 (10-frame overlap with typewriter end)
const SCREENSHOT_START = 85;

export const CodeToUI: React.FC<CodeToUIProps> = ({
  code,
  language,
  label,
  screenshotUrl,
  theme,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  // Suppress unused warnings — these props are part of the standard scene contract.
  void durationInFrames;

  const leftFade = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  const charsToShow = Math.floor(
    interpolate(frame, [TYPE_START, TYPE_END], [0, code.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  const showCursor = frame >= TYPE_START && frame < TYPE_END;
  const cursorVisible = frame % 12 < 6;

  const screenshotProgress = spring({
    frame: frame - SCREENSHOT_START,
    fps: 30,
    config: { stiffness: 120, damping: 22 },
  });

  return (
    <AbsoluteFill style={{ background: '#0a0a0a', display: 'flex', flexDirection: 'row' }}>
      {/* Left panel — code */}
      <div
        style={{
          width: '44%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px 48px 60px 60px',
          opacity: leftFade,
        }}
      >
        {/* Label badge */}
        {label && (
          <div
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              background: theme.primary,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              padding: '4px 12px',
              borderRadius: 6,
              marginBottom: 12,
              letterSpacing: '0.02em',
            }}
          >
            {label}
          </div>
        )}

        {/* Language badge */}
        {language && (
          <div
            style={{
              display: 'inline-flex',
              alignSelf: 'flex-start',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: 12,
              fontWeight: 500,
              padding: '3px 10px',
              borderRadius: 4,
              marginBottom: 16,
              fontFamily: 'Courier New, monospace',
              letterSpacing: '0.04em',
            }}
          >
            {language}
          </div>
        )}

        {/* Code area */}
        <div
          style={{
            background: '#111827',
            borderRadius: 12,
            padding: '32px 36px',
            flex: 1,
            maxHeight: 440,
            overflow: 'hidden',
          }}
        >
          <pre
            style={{
              margin: 0,
              fontFamily: 'Courier New, monospace',
              fontSize: 16,
              lineHeight: 1.6,
              color: '#e2e8f0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {code.slice(0, charsToShow)}
            {showCursor && (
              <span style={{ opacity: cursorVisible ? 1 : 0, color: theme.primary }}>|</span>
            )}
          </pre>
        </div>
      </div>

      {/* Right panel — screenshot or fallback */}
      <div
        style={{
          width: '56%',
          overflow: 'hidden',
          opacity: screenshotProgress,
          transform: `translateX(${(1 - screenshotProgress) * 80}px)`,
        }}
      >
        {screenshotUrl ? (
          <Img
            src={screenshotUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'top center',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              background: `linear-gradient(135deg, ${theme.primary}30, ${theme.primary}08)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />
        )}
      </div>
    </AbsoluteFill>
  );
};
