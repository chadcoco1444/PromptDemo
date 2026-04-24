import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';
import { ImagePanel } from './variants/ImagePanel';
import { DashboardPanel } from './variants/DashboardPanel';

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
  const panel = imageSrc ? <ImagePanel src={imageSrc} theme={theme} /> : <DashboardPanel theme={theme} />;
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
