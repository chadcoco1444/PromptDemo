import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';
import { ImagePanel } from './variants/ImagePanel';

export interface FeatureCalloutProps {
  title: string;
  description: string;
  layout: 'leftImage' | 'rightImage' | 'topDown';
  theme: BrandTheme;
  /** Resolved http(s) URL of the viewport screenshot. When present, replaces
   *  the stylized FakePanel with a real screenshot of the source site. */
  imageSrc?: string;
}

export const FeatureCallout: React.FC<FeatureCalloutProps> = ({
  title,
  description,
  layout,
  theme,
  imageSrc,
}) => {
  const panel = imageSrc ? <ImagePanel src={imageSrc} theme={theme} /> : <FakePanel theme={theme} />;
  return (
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
        {layout === 'rightImage' ? panel : null}
        <div style={{ flex: 1, maxWidth: 560 }}>
          <AnimatedText text={title} style={{ fontSize: 48, fontWeight: 700, color: theme.primary }} />
          <div style={{ marginTop: 24 }}>
            <AnimatedText text={description} delayFrames={12} style={{ fontSize: 24, lineHeight: 1.4 }} />
          </div>
        </div>
        {layout !== 'rightImage' ? panel : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Mock UI placeholder: gradient background + abstracted dashboard-style elements
// (header row, data bars, stat cards). No real text — just shape placeholders —
// so it reads as "generic product surface" regardless of what the site is about.
const FakePanel: React.FC<{ theme: BrandTheme }> = ({ theme }) => {
  const onBg = 'rgba(255,255,255,0.16)';
  const onBgStrong = 'rgba(255,255,255,0.38)';
  const cardBg = 'rgba(255,255,255,0.07)';
  const border = 'rgba(255,255,255,0.14)';

  return (
    <div
      style={{
        width: 440,
        height: 320,
        borderRadius: 18,
        background: `linear-gradient(135deg, ${theme.primaryDark} 0%, ${theme.primary} 55%, ${theme.primaryLight} 100%)`,
        boxShadow: '0 30px 60px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.08)',
        position: 'relative',
        overflow: 'hidden',
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* top-left specular highlight */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 60% 80% at 15% 0%, rgba(255,255,255,0.22), transparent 55%)',
          pointerEvents: 'none',
        }}
      />

      {/* Header row: icon + title bar  |  pill button */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: 12,
          borderBottom: `1px solid ${border}`,
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ width: 26, height: 26, borderRadius: 7, background: onBgStrong }} />
          <div style={{ width: 110, height: 10, borderRadius: 3, background: onBg }} />
        </div>
        <div
          style={{
            width: 70,
            height: 24,
            borderRadius: 12,
            background: onBg,
            border: `1px solid ${border}`,
          }}
        />
      </div>

      {/* Data rows: bullet + progress bar + value */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative' }}>
        {[0.78, 0.52, 0.88].map((pct, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: onBgStrong }} />
            <div
              style={{
                flex: 1,
                height: 6,
                borderRadius: 3,
                background: 'rgba(255,255,255,0.08)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${pct * 100}%`,
                  borderRadius: 3,
                  background: onBgStrong,
                }}
              />
            </div>
            <div style={{ width: 30, height: 8, borderRadius: 2, background: onBg }} />
          </div>
        ))}
      </div>

      {/* Stat cards row */}
      <div style={{ display: 'flex', gap: 10, marginTop: 'auto', position: 'relative' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              flex: 1,
              padding: 12,
              borderRadius: 10,
              background: cardBg,
              border: `1px solid ${border}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 7,
            }}
          >
            <div style={{ width: '65%', height: 6, borderRadius: 2, background: onBg }} />
            <div style={{ width: '45%', height: 14, borderRadius: 3, background: onBgStrong }} />
          </div>
        ))}
      </div>
    </div>
  );
};
