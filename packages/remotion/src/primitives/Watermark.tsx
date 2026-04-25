import React from 'react';
import { AbsoluteFill } from 'remotion';

export const Watermark: React.FC = () => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <div
      style={{
        position: 'absolute',
        bottom: '3%',
        right: '2%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'rgba(0, 0, 0, 0.50)',
        border: '1px solid rgba(255, 255, 255, 0.18)',
        borderRadius: 24,
        padding: '5px 14px 5px 8px',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
          borderRadius: 5,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'rgba(255, 255, 255, 0.88)',
          letterSpacing: '0.02em',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          whiteSpace: 'nowrap',
        }}
      >
        Made with LumeSpec
      </span>
    </div>
  </AbsoluteFill>
);
