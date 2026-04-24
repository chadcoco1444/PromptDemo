import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';

export interface TextPunchProps {
  text: string;
  emphasis: 'primary' | 'secondary' | 'neutral';
  theme: BrandTheme;
}

export const TextPunch: React.FC<TextPunchProps> = ({ text, emphasis, theme }) => {
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
