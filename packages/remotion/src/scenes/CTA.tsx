import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText.js';
import { LogoMark } from '../primitives/LogoMark.js';
import type { BrandTheme } from '../utils/brandTheme.js';

export interface CTAProps {
  headline: string;
  url: string;
  logoUrl?: string;
  theme: BrandTheme;
}

export const CTA: React.FC<CTAProps> = ({ headline, url, logoUrl, theme }) => {
  const hostname = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  })();
  const logoProps = {
    ...(logoUrl ? { logoUrl } : {}),
    fallbackUrl: url,
    size: 120,
    bg: theme.primaryLight,
    textOn: theme.textOn,
  };
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})`,
        color: theme.textOn,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <LogoMark {...logoProps} />
        </div>
        <AnimatedText text={headline} style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.15 }} />
        <div style={{ marginTop: 32, fontSize: 28, opacity: 0.85, fontFamily: 'monospace' }}>
          {hostname}
        </div>
      </div>
    </AbsoluteFill>
  );
};
