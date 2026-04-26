import React from 'react';
import { AbsoluteFill, useCurrentFrame, spring } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

/** Kept for backward compatibility — component now uses grid template areas. */
export function getColumnCount(itemCount: number): number {
  return itemCount <= 4 ? 2 : 3;
}

interface GridConfig {
  templateAreas: string;
  templateColumns: string;
  templateRows: string;
  areas: string[];
  /** Indices of cards that span 2 cols/rows — get larger font + gradient bg. */
  featuredIndices: number[];
}

// Asymmetric bento layouts: hero cards (span 2) create visual hierarchy.
// 3 items: tall hero on left + 2 small cards stacked right.
// 4 items: wide hero top-left, small top-right, small bottom-left, wide hero bottom-right.
// 5 items: wide hero top + 3 equal below.
// 6 items: zigzag — hero·small / small·hero / hero·small.
const GRID_CONFIGS: Record<number, GridConfig> = {
  3: {
    templateAreas: '"a b" "a c"',
    templateColumns: '1fr 1fr',
    templateRows: '1fr 1fr',
    areas: ['a', 'b', 'c'],
    featuredIndices: [0],
  },
  4: {
    templateAreas: '"a a b" "c d d"',
    templateColumns: 'repeat(3, 1fr)',
    templateRows: '1fr 1fr',
    areas: ['a', 'b', 'c', 'd'],
    featuredIndices: [0, 3],
  },
  5: {
    templateAreas: '"a a b" "c d e"',
    templateColumns: 'repeat(3, 1fr)',
    templateRows: '1fr 1fr',
    areas: ['a', 'b', 'c', 'd', 'e'],
    featuredIndices: [0],
  },
  6: {
    templateAreas: '"a a b" "c d d" "e e f"',
    templateColumns: 'repeat(3, 1fr)',
    templateRows: 'repeat(3, 1fr)',
    areas: ['a', 'b', 'c', 'd', 'e', 'f'],
    featuredIndices: [0, 3, 4],
  },
};

export function getGridConfig(itemCount: number): GridConfig {
  const clamped = Math.min(Math.max(itemCount, 3), 6) as 3 | 4 | 5 | 6;
  return GRID_CONFIGS[clamped];
}

export interface BentoGridProps {
  items: Array<{ title: string; description?: string; iconHint?: string }>;
  theme: BrandTheme;
}

export const BentoGrid: React.FC<BentoGridProps> = ({ items, theme }) => {
  const frame = useCurrentFrame();
  const config = getGridConfig(items.length);

  return (
    <AbsoluteFill
      style={{
        background: '#0a0a0a',
        padding: 64,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateAreas: config.templateAreas,
          gridTemplateColumns: config.templateColumns,
          gridTemplateRows: config.templateRows,
          gap: 20,
          flex: 1,
        }}
      >
        {items.map((item, i) => {
          const isFeatured = config.featuredIndices.includes(i);
          const springConfig = isFeatured
            ? { stiffness: 160, damping: 20, mass: 1 }
            : { stiffness: 200, damping: 24, mass: 1 };
          const progress = spring({
            frame: frame - i * 6,
            fps: 30,
            config: springConfig,
          });

          return (
            <div
              key={i}
              style={{
                gridArea: config.areas[i],
                background: isFeatured
                  ? 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)'
                  : 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderBottom: `2px solid ${theme.primary}`,
                borderRadius: 16,
                padding: isFeatured ? 32 : 24,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-end',
                opacity: progress,
                transform: `translateY(${(1 - progress) * 40}px) scale(${0.92 + 0.08 * progress})`,
              }}
            >
              {item.iconHint && (
                <div style={{ fontSize: isFeatured ? 40 : 32, marginBottom: 12 }}>
                  {item.iconHint}
                </div>
              )}
              <div
                style={{
                  color: '#ffffff',
                  fontSize: isFeatured ? 28 : 20,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  marginBottom: item.description ? 8 : 0,
                }}
              >
                {item.title}
              </div>
              {item.description && item.description.trim() !== item.title.trim() && (
                <div style={{ color: '#9ca3af', fontSize: isFeatured ? 16 : 14, lineHeight: 1.5 }}>
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
