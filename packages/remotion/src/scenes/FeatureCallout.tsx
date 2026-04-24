import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';

export interface FeatureCalloutProps {
  title: string;
  description: string;
  layout: 'leftImage' | 'rightImage' | 'topDown';
  theme: BrandTheme;
}

export const FeatureCallout: React.FC<FeatureCalloutProps> = ({ title, description, layout, theme }) => (
  <AbsoluteFill style={{ background: theme.bg, color: '#111' }}>
    <AbsoluteFill
      style={{
        padding: 80,
        display: 'flex',
        flexDirection: layout === 'topDown' ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 60,
      }}
    >
      {layout === 'rightImage' ? <FakePanel theme={theme} /> : null}
      <div style={{ flex: 1, maxWidth: 560 }}>
        <AnimatedText text={title} style={{ fontSize: 48, fontWeight: 700, color: theme.primary }} />
        <div style={{ marginTop: 24 }}>
          <AnimatedText text={description} delayFrames={12} style={{ fontSize: 24, lineHeight: 1.4 }} />
        </div>
      </div>
      {layout !== 'rightImage' ? <FakePanel theme={theme} /> : null}
    </AbsoluteFill>
  </AbsoluteFill>
);

const FakePanel: React.FC<{ theme: BrandTheme }> = ({ theme }) => (
  <div
    style={{
      width: 440,
      height: 320,
      borderRadius: 20,
      background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryLight})`,
      boxShadow: '0 20px 40px rgba(0,0,0,0.12)',
    }}
  />
);
