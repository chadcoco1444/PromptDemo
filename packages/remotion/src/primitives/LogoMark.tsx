import React from 'react';
import { Img } from 'remotion';
import { domainInitials } from '../utils/domainInitials.js';

export interface LogoMarkProps {
  logoUrl?: string; // resolved HTTP URL, not s3://
  fallbackUrl: string;
  size?: number;
  bg: string;
  textOn: string;
}

export const LogoMark: React.FC<LogoMarkProps> = ({ logoUrl, fallbackUrl, size = 64, bg, textOn }) => {
  if (logoUrl) {
    return <Img src={logoUrl} style={{ height: size, width: 'auto', objectFit: 'contain' }} />;
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size / 6,
        background: bg,
        color: textOn,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: size * 0.5,
        letterSpacing: -1,
      }}
    >
      {domainInitials(fallbackUrl)}
    </div>
  );
};
