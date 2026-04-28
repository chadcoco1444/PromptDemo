import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';
import { TextPunchPhotoBackdrop } from './variants/TextPunchPhotoBackdrop';
import { TextPunchSlideBlock } from './variants/TextPunchSlideBlock';

export interface TextPunchProps {
  text: string;
  emphasis: 'primary' | 'secondary' | 'neutral';
  variant?: 'default' | 'photoBackdrop' | 'slideBlock';
  theme: BrandTheme;
  screenshotUrl?: string;  // optional; only used by photoBackdrop variant; absent triggers default fallback
}

export const TextPunch: React.FC<TextPunchProps> = ({
  text,
  emphasis,
  variant = 'default',
  theme,
  screenshotUrl,
}) => {
  // Inline narrowing keeps screenshotUrl's non-null type within the branch
  // without needing a `!` assertion. Falls back to default rendering when
  // photoBackdrop is requested but the screenshot URL is missing —
  // graceful degradation per spec §3.2 (silent transparent-image bug
  // would be much worse than a tasteful fallback).
  if (variant === 'photoBackdrop' && screenshotUrl) {
    return <TextPunchPhotoBackdrop text={text} screenshotUrl={screenshotUrl} />;
  }
  if (variant === 'slideBlock') {
    return <TextPunchSlideBlock text={text} emphasis={emphasis} theme={theme} />;
  }
  return <DefaultVariant text={text} emphasis={emphasis} theme={theme} />;
};

// Inline default variant — bit-identical to pre-v1.7 TextPunch render. Kept
// inline (not in scenes/variants/) because it's the legacy base case and
// only 12 lines; extracting would obscure the dispatcher's reading flow.
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
