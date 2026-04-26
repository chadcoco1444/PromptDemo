import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export interface ReviewMarqueeProps {
  reviews: Array<{ text: string; author?: string | undefined }>;
  speed: 'slow' | 'medium' | 'fast';
  theme: BrandTheme;
  durationInFrames: number;
}

const SPEED_PX_PER_FRAME: Record<string, number> = { slow: 2, medium: 4, fast: 7 };
const CARD_WIDTH = 520;
const CARD_GAP = 28;

export const ReviewMarquee: React.FC<ReviewMarqueeProps> = ({
  reviews,
  speed,
  theme,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();

  // Duplicate reviews so the ticker reads as a continuous stream for the
  // full scene duration without running out of content.
  const items = [...reviews, ...reviews, ...reviews];
  const totalWidth = items.length * (CARD_WIDTH + CARD_GAP);
  const pxPerFrame = SPEED_PX_PER_FRAME[speed] ?? 4;

  // Scroll the full strip leftward.  Clamp so we never scroll past the strip.
  const maxOffset = totalWidth - 1280;
  const offset = Math.min(frame * pxPerFrame, maxOffset);

  // Fade in over the first 20 frames.
  const fadeIn = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        background: '#0a0a0a',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        opacity: fadeIn,
      }}
    >
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
          gap: CARD_GAP,
          transform: `translateX(${-offset}px)`,
          alignItems: 'stretch',
          paddingLeft: 60,
          paddingRight: 60,
          willChange: 'transform',
        }}
      >
        {items.map((review, i) => (
          <ReviewCard key={i} review={review} theme={theme} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

interface ReviewCardProps {
  review: { text: string; author?: string | undefined };
  theme: BrandTheme;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ review, theme }) => (
  <div
    style={{
      width: CARD_WIDTH,
      flexShrink: 0,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.10)',
      borderLeft: `4px solid ${theme.primary}`,
      borderRadius: 16,
      padding: '36px 40px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      minHeight: 220,
    }}
  >
    {/* Opening quote mark */}
    <div
      style={{
        color: theme.primary,
        fontSize: 64,
        lineHeight: 0.6,
        marginBottom: 16,
        opacity: 0.6,
        fontFamily: 'Georgia, serif',
      }}
    >
      "
    </div>

    <p
      style={{
        color: '#e2e8f0',
        fontSize: 20,
        lineHeight: 1.6,
        margin: 0,
        flex: 1,
        fontStyle: 'italic',
      }}
    >
      {review.text}
    </p>

    {review.author && (
      <div
        style={{
          marginTop: 24,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        {/* Avatar initial dot */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: theme.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 15,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {review.author[0]?.toUpperCase() ?? '?'}
        </div>
        <span
          style={{
            color: '#94a3b8',
            fontSize: 16,
            fontWeight: 600,
          }}
        >
          {review.author}
        </span>
      </div>
    )}
  </div>
);
