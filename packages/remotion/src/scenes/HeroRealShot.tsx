import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText.js';
import { BrowserChrome } from '../primitives/BrowserChrome.js';
import type { BrandTheme } from '../utils/brandTheme.js';

export interface HeroRealShotProps {
  title: string;
  subtitle?: string;
  screenshotUrl: string; // already resolved from s3://
  url: string;
  theme: BrandTheme;
}

export const HeroRealShot: React.FC<HeroRealShotProps> = ({ title, subtitle, screenshotUrl, url, theme }) => (
  <AbsoluteFill style={{ background: theme.primary }}>
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', padding: 60 }}>
      <div style={{ textAlign: 'center', marginBottom: 40, color: theme.textOn }}>
        <AnimatedText
          text={title}
          style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}
        />
        {subtitle ? (
          <div style={{ marginTop: 16 }}>
            <AnimatedText
              text={subtitle}
              delayFrames={15}
              style={{ fontSize: 24, opacity: 0.9 }}
            />
          </div>
        ) : null}
      </div>
      <BrowserChrome url={url} style={{ width: 960, height: 540 }}>
        <Img src={screenshotUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </BrowserChrome>
    </AbsoluteFill>
  </AbsoluteFill>
);
