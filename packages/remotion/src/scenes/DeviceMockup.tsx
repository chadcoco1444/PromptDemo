import React from 'react';
import { AbsoluteFill, Easing, Img, interpolate, useCurrentFrame } from 'remotion';
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
 */
// easeOutCubic for pushIn (focus); easeInOutCubic for pullOut (reveal)
function computeTransform(motion: 'pushIn' | 'pullOut', frame: number, total: number) {
  // Guard: Remotion's interpolate throws on non-monotonic input ranges (e.g. [0, 0]).
  if (total <= 1) {
    return motion === 'pushIn'
      ? { scale: 1.0, translateY: 0 }
      : { scale: 1.25, translateY: -3 };
  }

  const easing = motion === 'pushIn' ? Easing.out(Easing.cubic) : Easing.inOut(Easing.cubic);
  const opts = {
    easing,
    extrapolateLeft: 'clamp' as const,
    extrapolateRight: 'clamp' as const,
  };

  if (motion === 'pushIn') {
    const scale = interpolate(frame, [0, total - 1], [1.0, 1.18], opts);
    const translateY = interpolate(frame, [0, total - 1], [0, -2], opts); // percent of frame
    return { scale, translateY };
  }
  const scale = interpolate(frame, [0, total - 1], [1.25, 1.0], opts);
  const translateY = interpolate(frame, [0, total - 1], [-3, 0], opts);
  return { scale, translateY };
}

export const DeviceMockup: React.FC<DeviceMockupProps> = ({
  headline,
  subtitle,
  screenshotUrl,
  device,
  motion,
  durationInFrames,
  theme,
}) => {
  void device; // v1: laptop-only — phone routes via resolveScene fallback to HeroRealShot

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
