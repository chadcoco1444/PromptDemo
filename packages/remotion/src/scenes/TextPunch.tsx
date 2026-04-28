import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';

export interface TextPunchProps {
  text: string;
  emphasis: 'primary' | 'secondary' | 'neutral';
  variant?: 'default' | 'photoBackdrop' | 'slideBlock';
  theme: BrandTheme;
  screenshotUrl?: string;  // optional; required for photoBackdrop, falls back to default if absent
}

export const TextPunch: React.FC<TextPunchProps> = ({
  text,
  emphasis,
  variant = 'default',
  theme,
  screenshotUrl,
}) => {
  // photoBackdrop falls back to default if screenshot URL is missing —
  // graceful degradation per spec §3.2 (no exception thrown). Silent
  // transparent-image rendering is the worst kind of bug — explicit
  // fallback prevents it.
  const effectiveVariant =
    variant === 'photoBackdrop' && !screenshotUrl ? 'default' : variant;

  if (effectiveVariant === 'photoBackdrop') {
    return <PhotoBackdropVariant text={text} screenshotUrl={screenshotUrl!} />;
  }
  if (effectiveVariant === 'slideBlock') {
    return <SlideBlockVariant text={text} emphasis={emphasis} theme={theme} />;
  }
  return <DefaultVariant text={text} emphasis={emphasis} theme={theme} />;
};

const DefaultVariant: React.FC<{ text: string; emphasis: TextPunchProps['emphasis']; theme: BrandTheme }> = ({
  text,
  emphasis,
  theme,
}) => {
  const bg =
    emphasis === 'primary' ? theme.primary : emphasis === 'secondary' ? theme.primaryDark : '#111';
  const color = emphasis === 'neutral' ? '#fff' : theme.textOn;
  return (
    <AbsoluteFill style={{ background: bg, alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: 1000, textAlign: 'center', color, padding: 80 }}>
        <AnimatedText text={text} mode="charFade" style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }} />
      </div>
    </AbsoluteFill>
  );
};

const PhotoBackdropVariant: React.FC<{ text: string; screenshotUrl: string }> = ({ text, screenshotUrl }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  // Slow Ken Burns: 1.0 → 1.04 over scene duration.
  const scale = interpolate(frame, [0, durationInFrames], [1.0, 1.04], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      {/* Faded screenshot background with Ken Burns + blur */}
      <AbsoluteFill style={{ transform: `scale(${scale})`, filter: 'blur(3px)', opacity: 0.22 }}>
        <Img src={screenshotUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      {/* Dark gradient overlay for text legibility */}
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.4) 100%)' }} />
      {/* Foreground text with shadow */}
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

const SlideBlockVariant: React.FC<{ text: string; emphasis: TextPunchProps['emphasis']; theme: BrandTheme }> = ({
  text,
  emphasis,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const bg =
    emphasis === 'primary' ? theme.primary : emphasis === 'secondary' ? theme.primaryDark : '#111';
  const color = emphasis === 'neutral' ? '#fff' : theme.textOn;

  // Block slides in from right over first 12 frames, holds, slides out to left over last 8 frames.
  const enterProgress = spring({ frame, fps, config: { mass: 1, damping: 18, stiffness: 80 } });
  const exitStart = durationInFrames - 8;
  const exitProgress = interpolate(frame, [exitStart, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // x-translation: 100% → 0% (enter) → -100% (exit)
  const enterX = interpolate(enterProgress, [0, 1], [100, 0]);
  const exitX = interpolate(exitProgress, [0, 1], [0, -100]);
  const finalX = exitProgress > 0 ? exitX : enterX;

  // Text fades in 4 frames after block stops.
  const textOpacity = interpolate(frame, [12, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <AbsoluteFill style={{ transform: `translateX(${finalX}%)`, background: bg }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: textOpacity,
          }}
        >
          <div style={{ maxWidth: 1000, textAlign: 'center', color, padding: 80 }}>
            <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1 }}>{text}</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
