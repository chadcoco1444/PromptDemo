import React from 'react';
import { Img } from 'remotion';
import type { BrandTheme } from '../../utils/brandTheme';

export interface ImagePanelProps {
  src: string;
  theme: BrandTheme;
}

export const ImagePanel: React.FC<ImagePanelProps> = ({ src, theme }) => (
  <div
    style={{
      width: 520,
      height: 340,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 30px 60px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.08)',
      background: theme.primaryDark,
      position: 'relative',
    }}
  >
    <Img src={src} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.06), transparent 30%)',
        pointerEvents: 'none',
      }}
    />
  </div>
);
