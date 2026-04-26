import React from 'react';
import { AbsoluteFill, useCurrentFrame, spring, interpolate } from 'remotion';
import type { BrandTheme } from '../utils/brandTheme';

export interface StatsCounterProps {
  stats: Array<{ value: string; label: string }>;
  theme: BrandTheme;
}

interface ParsedStat {
  num: number;
  suffix: string;
  isFraction: boolean;
}

/** Returns null when the value string doesn't contain a leading parseable number. */
function parseStat(raw: string): ParsedStat | null {
  const m = raw.match(/^([\d,]+(?:\.\d+)?)\s*(.*)$/);
  if (!m) return null;
  const num = parseFloat(m[1]!.replace(/,/g, ''));
  if (!isFinite(num) || isNaN(num)) return null;
  return { num, suffix: m[2]?.trim() ?? '', isFraction: m[1]!.includes('.') };
}

// Rolls from 0→target over this many frames after the card appears.
const ROLL_FRAMES = 45;

export const StatsCounter: React.FC<StatsCounterProps> = ({ stats, theme }) => {
  const frame = useCurrentFrame();
  const count = Math.max(1, Math.min(stats.length, 4));

  return (
    <AbsoluteFill
      style={{
        background: '#0a0a0a',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 80,
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 32,
          justifyContent: 'center',
          width: '100%',
        }}
      >
        {stats.slice(0, count).map((stat, i) => {
          const stagger = i * 10;
          const cardProgress = spring({
            frame: frame - stagger,
            fps: 30,
            config: { stiffness: 180, damping: 22, mass: 1 },
          });

          const parsed = parseStat(stat.value);
          let displayValue: string;
          if (parsed) {
            const rollProgress = interpolate(frame - stagger, [0, ROLL_FRAMES], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            const rolled = parsed.isFraction
              ? (parsed.num * rollProgress).toFixed(1)
              : Math.round(parsed.num * rollProgress).toLocaleString();
            displayValue = rolled + (parsed.suffix ? ` ${parsed.suffix}` : '');
          } else {
            // Graceful degradation: no parseable number — show as-is.
            displayValue = stat.value;
          }

          return (
            <div
              key={i}
              style={{
                flex: 1,
                maxWidth: 280,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderBottom: `3px solid ${theme.primary}`,
                borderRadius: 20,
                padding: '40px 32px',
                textAlign: 'center',
                opacity: cardProgress,
                transform: `translateY(${(1 - cardProgress) * 60}px)`,
              }}
            >
              <div
                style={{
                  color: theme.primary,
                  fontSize: 64,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: '-0.02em',
                  marginBottom: 16,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {displayValue}
              </div>
              <div
                style={{
                  color: '#9ca3af',
                  fontSize: 18,
                  fontWeight: 500,
                  lineHeight: 1.4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {stat.label}
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
