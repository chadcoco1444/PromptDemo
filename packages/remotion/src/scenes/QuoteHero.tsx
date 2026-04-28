import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export interface QuoteHeroProps {
  quote: string;
  author: string;
  attribution?: string;
  backgroundHint: 'gradient' | 'screenshot';
  screenshotUrl?: string;
  theme: BrandTheme;
}

export const QuoteHero: React.FC<QuoteHeroProps> = ({
  quote,
  author,
  attribution,
  backgroundHint,
  screenshotUrl,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const bgScale = interpolate(frame, [0, durationInFrames], [1.0, 1.05], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const quoteOpacity = interpolate(frame, [6, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const quoteTranslateY = interpolate(frame, [6, 22], [16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const authorOpacity = interpolate(frame, [18, 32], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#0d0d1a' }}>
      {/* Inline narrowing keeps screenshotUrl's non-null type within the
          branch — mirrors T6 TextPunch pattern. Falls back to gradient if
          screenshot mode requested but URL missing (graceful, no exception). */}
      {backgroundHint === 'screenshot' && screenshotUrl ? (
        <AbsoluteFill style={{ transform: `scale(${bgScale})`, opacity: 0.08 }}>
          <Img src={screenshotUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill
          style={{
            background: `linear-gradient(135deg, ${theme.primaryDark} 0%, #0d0d1a 100%)`,
            transform: `scale(${bgScale})`,
          }}
        />
      )}

      <div
        style={{
          position: 'absolute',
          top: 60,
          left: 80,
          fontSize: 280,
          fontFamily: 'Georgia, "Times New Roman", serif',
          color: theme.primary,
          opacity: 0.7,
          lineHeight: 1,
        }}
      >
        &ldquo;
      </div>

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingLeft: 120, paddingRight: 80 }}>
        <div
          style={{
            maxWidth: 1300,
            opacity: quoteOpacity,
            transform: `translateY(${quoteTranslateY}px)`,
          }}
        >
          <div
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: 56,
              fontWeight: 500,
              lineHeight: 1.3,
              color: '#fff',
            }}
          >
            {quote}
          </div>

          <div style={{ opacity: authorOpacity, marginTop: 60 }}>
            <div style={{ width: 140, height: 3, background: theme.primary, marginBottom: 24 }} />
            <div
              style={{
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 22,
                fontWeight: 600,
                color: theme.textOn,
              }}
            >
              {author}
            </div>
            {attribution && (
              <div
                style={{
                  fontFamily: 'Inter, system-ui, sans-serif',
                  fontSize: 18,
                  color: theme.primary,
                  marginTop: 4,
                }}
              >
                {attribution}
              </div>
            )}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
