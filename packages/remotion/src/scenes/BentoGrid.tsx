import React from 'react';
import { AbsoluteFill, useCurrentFrame, spring } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export function getColumnCount(itemCount: number): number {
  return itemCount <= 4 ? 2 : 3;
}

export interface BentoGridProps {
  items: Array<{ title: string; description?: string; iconHint?: string }>;
  theme: BrandTheme;
}

export const BentoGrid: React.FC<BentoGridProps> = ({ items, theme }) => {
  const frame = useCurrentFrame();
  const columns = getColumnCount(items.length);

  return (
    <AbsoluteFill
      style={{
        background: '#0a0a0a',
        padding: 80,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, 1fr)`,
          gap: 24,
        }}
      >
        {items.map((item, i) => {
          const progress = spring({
            frame: frame - i * 5,
            fps: 30,
            config: { stiffness: 180, damping: 22, mass: 1 },
          });
          return (
            <div
              key={i}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderBottom: `2px solid ${theme.primary}`,
                borderRadius: 16,
                padding: 24,
                opacity: progress,
                transform: `scale(${0.85 + 0.15 * progress})`,
              }}
            >
              {item.iconHint && (
                <div style={{ fontSize: 32, marginBottom: 12 }}>{item.iconHint}</div>
              )}
              <div
                style={{
                  color: '#ffffff',
                  fontSize: 22,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  marginBottom: 8,
                }}
              >
                {item.title}
              </div>
              {item.description && (
                <div style={{ color: '#9ca3af', fontSize: 16, lineHeight: 1.5 }}>
                  {item.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
