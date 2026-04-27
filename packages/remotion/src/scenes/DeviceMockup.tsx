import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame } from 'remotion';
import { AnimatedText } from '../primitives/AnimatedText';
import type { BrandTheme } from '../utils/brandTheme';

export interface DeviceMockupProps {
  headline: string;
  subtitle?: string;
  /** Already resolved from s3:// to a presigned http(s):// URL by the render worker. */
  screenshotUrl: string;
  /** v1 only renders 'laptop'; resolveScene falls back to HeroRealShot for 'phone'. */
  device: 'laptop' | 'phone';
  motion: 'pushIn' | 'pullOut';
  durationInFrames: number;
  theme: BrandTheme;
}

/** Cinematic Pan/Zoom keyframes per Q5 design spec.
 *  pushIn  : scale 1.00 → 1.18, translateY  0  → -2  (easeOutCubic)
 *  pullOut : scale 1.25 → 1.00, translateY -3  →  0  (easeInOutCubic)
 *
 *  Easing math is computed inline so we avoid depending on @remotion/transitions
 *  easings; identical visually for these small ranges at 30fps.
 */
function computeTransform(motion: 'pushIn' | 'pullOut', frame: number, total: number) {
  const t = total > 1 ? Math.max(0, Math.min(1, frame / (total - 1))) : 0;
  const eased =
    motion === 'pushIn'
      ? 1 - Math.pow(1 - t, 3) // easeOutCubic
      : t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic

  if (motion === 'pushIn') {
    const scale = interpolate(eased, [0, 1], [1.0, 1.18]);
    const translateY = interpolate(eased, [0, 1], [0, -2]); // percent of frame
    return { scale, translateY };
  }
  const scale = interpolate(eased, [0, 1], [1.25, 1.0]);
  const translateY = interpolate(eased, [0, 1], [-3, 0]);
  return { scale, translateY };
}

export const DeviceMockup: React.FC<DeviceMockupProps> = ({
  headline,
  subtitle,
  screenshotUrl,
  motion,
  durationInFrames,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { scale, translateY } = computeTransform(motion, frame, durationInFrames);

  return (
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(circle at 50% 30%, #1f2937 0%, #0a0a0a 100%)',
        color: theme.textOn,
      }}
    >
      {/* Device shell — animates per `motion` */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '8%',
          width: '70%',
          transform: `translateX(-50%) translateY(${translateY}%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* Bezel + screen */}
        <div
          style={{
            background: 'linear-gradient(180deg, #27272a 0%, #18181b 100%)',
            border: '1px solid #3f3f46',
            borderRadius: '14px 14px 4px 4px',
            padding: '18px 14px',
            aspectRatio: '16 / 10',
            boxShadow:
              '0 30px 80px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
            position: 'relative',
          }}
        >
          {/* Screen content */}
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: 4,
              overflow: 'hidden',
              position: 'relative',
              background: '#000',
            }}
          >
            <Img
              src={screenshotUrl}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {/* Subtle screen-glare overlay (top-left highlight) */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background:
                  'linear-gradient(125deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%)',
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>
        {/* Hinge / base bar */}
        <div
          style={{
            background: 'linear-gradient(180deg, #3f3f46 0%, #18181b 100%)',
            height: 8,
            borderRadius: '0 0 18px 18px',
            margin: '0 -14px',
            boxShadow: '0 8px 16px rgba(0,0,0,0.45)',
          }}
        />
      </div>

      {/* Headline + subtitle — STATIC anchor below the device (Q7) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '70%',
          textAlign: 'center',
          padding: '0 60px',
          color: '#ffffff',
        }}
      >
        <AnimatedText
          text={headline}
          style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}
        />
        {subtitle ? (
          <div style={{ marginTop: 16 }}>
            <AnimatedText
              text={subtitle}
              delayFrames={15}
              style={{ fontSize: 24, opacity: 0.65 }}
            />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
