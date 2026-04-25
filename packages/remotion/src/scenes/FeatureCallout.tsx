import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { FeatureVariant } from '@lumespec/schema';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';
import { ImagePanel } from './variants/ImagePanel';
import { KenBurnsPanel } from './variants/KenBurnsPanel';
import { CollagePanel } from './variants/CollagePanel';
import { DashboardPanel } from './variants/DashboardPanel';

export interface FeatureCalloutProps {
  title: string;
  description: string;
  layout: 'leftImage' | 'rightImage' | 'topDown';
  theme: BrandTheme;
  /** Optional with 'image' default; matches schema .default('image'). */
  variant?: FeatureVariant;
  /** Resolved viewport screenshot URL — required by image/collage variants (collage
   *  also accepts fullPage; the dispatcher routes by variant). */
  viewportSrc?: string;
  /** Resolved fullPage screenshot URL — required by kenBurns and collage. */
  fullPageSrc?: string;
}

export const FeatureCallout: React.FC<FeatureCalloutProps> = ({
  title,
  description,
  layout,
  theme,
  variant = 'image',
  viewportSrc,
  fullPageSrc,
}) => {
  const panel = renderPanel(variant, { theme, viewportSrc, fullPageSrc });
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

function renderPanel(
  variant: FeatureVariant,
  ctx: { theme: BrandTheme; viewportSrc?: string | undefined; fullPageSrc?: string | undefined }
): React.ReactElement {
  switch (variant) {
    case 'kenBurns':
      if (ctx.fullPageSrc) return <KenBurnsPanel src={ctx.fullPageSrc} theme={ctx.theme} />;
      // Fallback: fullPage missing (shouldn't happen — selector guards this) — degrade to image.
      if (ctx.viewportSrc) return <ImagePanel src={ctx.viewportSrc} theme={ctx.theme} />;
      return <DashboardPanel theme={ctx.theme} />;
    case 'collage':
      if (ctx.fullPageSrc) return <CollagePanel src={ctx.fullPageSrc} theme={ctx.theme} />;
      if (ctx.viewportSrc) return <ImagePanel src={ctx.viewportSrc} theme={ctx.theme} />;
      return <DashboardPanel theme={ctx.theme} />;
    case 'image':
      if (ctx.viewportSrc) return <ImagePanel src={ctx.viewportSrc} theme={ctx.theme} />;
      return <DashboardPanel theme={ctx.theme} />;
    case 'dashboard':
      return <DashboardPanel theme={ctx.theme} />;
  }
}
