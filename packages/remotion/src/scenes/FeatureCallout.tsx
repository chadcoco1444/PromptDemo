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

// Stylized UI placeholder. Uses a three-stop diagonal gradient (primaryDark →
// primary → primaryLight) so the panel reads as a dimensional surface even
// when the detected brand color is very dark. Layered highlights + a subtle
// grid give it a tech feel without needing real UI content.
const FakePanel: React.FC<{ theme: BrandTheme }> = ({ theme }) => (
  <div
    style={{
      width: 440,
      height: 320,
      borderRadius: 20,
      background: `linear-gradient(135deg, ${theme.primaryDark} 0%, ${theme.primary} 50%, ${theme.primaryLight} 100%)`,
      boxShadow:
        '0 30px 60px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.08) inset',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    {/* top-left specular highlight */}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(ellipse 60% 80% at 15% 10%, rgba(255,255,255,0.28), transparent 55%)',
        pointerEvents: 'none',
      }}
    />
    {/* bottom-right deep shadow */}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background:
          'radial-gradient(ellipse 50% 60% at 85% 90%, rgba(0,0,0,0.35), transparent 60%)',
        pointerEvents: 'none',
      }}
    />
    {/* subtle tech grid */}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage:
          'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }}
    />
  </div>
);
