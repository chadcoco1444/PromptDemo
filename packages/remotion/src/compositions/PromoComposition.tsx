import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Sequence } from 'remotion';
import { Watermark } from '../primitives/Watermark';

// ─── shared constants ────────────────────────────────────────────────────────
const BG = '#0a0a0f';
const SURFACE = 'rgba(255,255,255,0.04)';
const BORDER = 'rgba(255,255,255,0.10)';
const PURPLE = '#7c3aed';
const INDIGO = '#4f46e5';
const TEXT = 'rgba(255,255,255,0.90)';
const MUTED = 'rgba(255,255,255,0.45)';
const ACCENT_GRADIENT = `linear-gradient(135deg, ${PURPLE}, ${INDIGO})`;
const FONT = 'system-ui, -apple-system, sans-serif';

function useFadeIn(delay = 0, duration = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return interpolate(frame, [delay, delay + duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

function useSlideUp(delay = 0, duration = 20) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120, mass: 0.8 } });
  const opacity = interpolate(s, [0, 1], [0, 1]);
  const translateY = interpolate(s, [0, 1], [24, 0]);
  return { opacity, translateY };
}

// ─── Scene 1: URL input + typing animation (frames 0–90) ────────────────────
const TARGET_URL = 'https://stripe.com';
const INTENT_TEXT = 'Showcase payment flow with confidence';

const Scene1Input: React.FC = () => {
  const frame = useCurrentFrame();

  // URL typing: characters appear one per 3 frames, starting at frame 20
  const urlCharCount = Math.max(0, Math.floor((frame - 20) / 2.5));
  const urlTyped = TARGET_URL.slice(0, urlCharCount);
  const showUrlCursor = frame < 20 + TARGET_URL.length * 2.5 + 8;

  // Intent typing: starts after URL is done
  const intentStart = 20 + TARGET_URL.length * 2.5 + 12;
  const intentCharCount = Math.max(0, Math.floor((frame - intentStart) / 2));
  const intentTyped = INTENT_TEXT.slice(0, intentCharCount);
  const showIntentCursor = frame >= intentStart && frame < intentStart + INTENT_TEXT.length * 2 + 10;

  // Button highlight
  const btnOpacity = frame > 75 ? interpolate(frame, [75, 85], [0.4, 1], { extrapolateRight: 'clamp' }) : 0.4;
  const btnScale = frame > 78 ? interpolate(frame, [78, 88], [1, 1.04], { extrapolateRight: 'clamp' }) : 1;

  const headerOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const headerY = interpolate(frame, [0, 18], [16, 0], { extrapolateRight: 'clamp' });

  const cardOpacity = interpolate(frame, [8, 28], [0, 1], { extrapolateRight: 'clamp' });
  const cardY = interpolate(frame, [8, 28], [20, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      {/* grid dots bg */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(124,58,237,0.12) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div style={{ position: 'relative', width: 640, opacity: cardOpacity, transform: `translateY(${cardY}px)` }}>
        {/* top badge */}
        <div style={{ opacity: headerOpacity, transform: `translateY(${headerY}px)`, marginBottom: 28, textAlign: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 20, padding: '6px 16px', fontSize: 13, color: 'rgba(167,139,250,1)', fontWeight: 500 }}>
            <span style={{ fontSize: 16 }}>✦</span> AI Demo Generator
          </span>
        </div>

        {/* card */}
        <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 16, padding: '32px 36px', backdropFilter: 'blur(20px)' }}>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 8, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Your website URL</div>
          <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.40)', border: '1px solid rgba(124,58,237,0.45)', borderRadius: 10, padding: '14px 18px', marginBottom: 20, gap: 10 }}>
            <span style={{ fontSize: 15, color: 'rgba(167,139,250,0.7)', fontWeight: 600 }}>https://</span>
            <span style={{ fontSize: 15, color: TEXT, flex: 1, fontFamily: 'monospace' }}>
              {urlTyped.replace('https://', '')}
              {showUrlCursor && <span style={{ display: 'inline-block', width: 2, height: 18, background: PURPLE, marginLeft: 1, verticalAlign: 'text-bottom' }} />}
            </span>
          </div>

          <div style={{ fontSize: 13, color: MUTED, marginBottom: 8, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>Describe your intent</div>
          <div style={{ background: 'rgba(0,0,0,0.40)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 18px', marginBottom: 24, minHeight: 52, display: 'flex', alignItems: 'flex-start' }}>
            <span style={{ fontSize: 14, color: intentTyped ? TEXT : MUTED, lineHeight: 1.6 }}>
              {intentTyped || ''}
              {showIntentCursor && <span style={{ display: 'inline-block', width: 2, height: 16, background: PURPLE, marginLeft: 1, verticalAlign: 'text-bottom' }} />}
            </span>
          </div>

          {/* Generate button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ background: ACCENT_GRADIENT, borderRadius: 10, padding: '13px 28px', opacity: btnOpacity, transform: `scale(${btnScale})`, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', transformOrigin: 'center' }}>
              <span style={{ fontSize: 20 }}>✦</span>
              <span style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>Generate Demo</span>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 2: Crawl → Storyboard JSON flash (frames 0–120) ──────────────────
const LOG_LINES = [
  { t: 0,  text: '▶  Launching Playwright browser…', color: MUTED },
  { t: 8,  text: '📸 Capturing full-page screenshot', color: MUTED },
  { t: 16, text: '🔍 Extracting content & industry signals', color: MUTED },
  { t: 24, text: '🧠 Claude — detecting industry: fintech', color: '#a78bfa' },
  { t: 32, text: '⚡ Tone: authority · momentum · clarity', color: '#a78bfa' },
  { t: 42, text: '✅ Crawl complete in 3.2s', color: '#4ade80' },
  { t: 52, text: '🎬 Creativity Engine → generating storyboard…', color: TEXT },
];

const JSON_SNIPPET = `{
  "scenes": [
    { "type": "HeroRealShot",
      "headline": "The New Standard…",
      "durationInFrames": 90 },
    { "type": "BentoGrid",
      "items": [
        { "title": "Instant Checkout" },
        { "title": "Global Payments" }
      ] },
    { "type": "CTA",
      "headline": "Start for free" }
  ]
}`;

const Scene2Crawl: React.FC = () => {
  const frame = useCurrentFrame();

  // Show JSON flash after frame 72
  const jsonOpacity = interpolate(frame, [72, 88], [0, 1], { extrapolateRight: 'clamp' });
  const jsonScale = interpolate(frame, [72, 88], [0.92, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#050508', display: 'flex', fontFamily: FONT }}>
      {/* terminal left */}
      <div style={{ width: '50%', padding: '40px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ fontSize: 12, color: MUTED, marginBottom: 16, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Crawl & Understand</div>
        <div style={{ background: 'rgba(0,0,0,0.7)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '20px 20px', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.9 }}>
          {LOG_LINES.map(({ t, text, color }, i) => {
            const lineOpacity = interpolate(frame, [t, t + 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            const lineX = interpolate(frame, [t, t + 8], [-12, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
            return (
              <div key={i} style={{ opacity: lineOpacity, transform: `translateX(${lineX}px)`, color }}>{text}</div>
            );
          })}
        </div>
      </div>

      {/* JSON right */}
      <div style={{ width: '50%', padding: '40px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: jsonOpacity, transform: `scale(${jsonScale})` }}>
        <div style={{ fontSize: 12, color: 'rgba(167,139,250,0.8)', marginBottom: 16, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Storyboard JSON</div>
        <div style={{ background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.30)', borderRadius: 12, padding: '20px 20px', fontFamily: 'monospace', fontSize: 12, color: '#c4b5fd', lineHeight: 1.8, whiteSpace: 'pre' }}>
          {JSON_SNIPPET}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 3: Scene cards flipping (frames 0–150) ────────────────────────────
const SCENE_CARDS = [
  { icon: '🦸', label: 'HeroRealShot', desc: 'Full-bleed hero image + headline', delay: 0 },
  { icon: '⚡', label: 'BentoGrid',    desc: 'Feature grid · up to 6 items',   delay: 15 },
  { icon: '✨', label: 'FeatureCallout', desc: 'Product detail + screenshot',  delay: 30 },
  { icon: '🎯', label: 'CTA',          desc: 'Action-driving closer scene',    delay: 45 },
];

const Scene3Cards: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });
  const headerY = interpolate(frame, [0, 16], [14, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(124,58,237,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div style={{ position: 'relative', width: 960 }}>
        <div style={{ opacity: headerOpacity, transform: `translateY(${headerY}px)`, textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 13, color: 'rgba(167,139,250,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>AI Storyboard</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>Rendered Scene by Scene</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {SCENE_CARDS.map(({ icon, label, desc, delay }) => {
            const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 110, mass: 0.9 } });
            const cardOpacity = interpolate(s, [0, 1], [0, 1]);
            const cardY = interpolate(s, [0, 1], [28, 0]);
            const cardScale = interpolate(s, [0, 1], [0.88, 1]);
            // subtle rotating glow
            const glowOpacity = interpolate(frame, [delay + 30, delay + 60], [0, 0.7], { extrapolateRight: 'clamp' });

            return (
              <div key={label} style={{ opacity: cardOpacity, transform: `translateY(${cardY}px) scale(${cardScale})` }}>
                <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '24px 20px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 0%, rgba(124,58,237,${glowOpacity * 0.25}), transparent 70%)` }} />
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 6 }}>{label}</div>
                  <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* render progress bar */}
        {(() => {
          const barStart = 80;
          const barWidth = interpolate(frame, [barStart, barStart + 60], [0, 100], { extrapolateRight: 'clamp' });
          const barOpacity = interpolate(frame, [barStart, barStart + 8], [0, 1], { extrapolateRight: 'clamp' });
          return (
            <div style={{ marginTop: 40, opacity: barOpacity }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: MUTED }}>Rendering scenes…</span>
                <span style={{ fontSize: 12, color: 'rgba(167,139,250,0.9)', fontFamily: 'monospace' }}>{Math.round(barWidth)}%</span>
              </div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 4 }}>
                <div style={{ height: '100%', width: `${barWidth}%`, background: ACCENT_GRADIENT, borderRadius: 4 }} />
              </div>
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 4: Simulated video preview with Pill Badge (frames 0–150) ─────────
const Scene4Preview: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const frameIn = spring({ frame, fps, config: { damping: 18, stiffness: 100, mass: 1 } });
  const containerScale = interpolate(frameIn, [0, 1], [0.9, 1]);
  const containerOpacity = interpolate(frameIn, [0, 1], [0, 1]);

  // Pill badge pulse after frame 60
  const badgeScale = frame > 60
    ? 1 + 0.03 * Math.sin(((frame - 60) / 18) * Math.PI * 2)
    : 1;
  const badgeGlow = frame > 60
    ? 0.4 + 0.3 * Math.sin(((frame - 60) / 18) * Math.PI * 2)
    : 0;

  // arrow pointing at badge
  const arrowOpacity = interpolate(frame, [70, 86], [0, 1], { extrapolateRight: 'clamp' });

  // "Ready to download" label
  const readyOpacity = interpolate(frame, [100, 115], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(79,70,229,0.12) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      <div style={{ position: 'relative', opacity: containerOpacity, transform: `scale(${containerScale})` }}>
        {/* simulated video player */}
        <div style={{ width: 720, height: 405, background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 40%, #1e1b4b 100%)', border: `1px solid ${BORDER}`, borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
          {/* mock video content */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', textAlign: 'center', lineHeight: 1.2 }}>Payments<br />Built for the<br />Internet</div>
            <div style={{ width: 64, height: 3, background: ACCENT_GRADIENT, borderRadius: 2 }} />
          </div>

          {/* Watermark pill — real Watermark component */}
          <div style={{ position: 'absolute', bottom: '6%', right: '3%', transform: `scale(${badgeScale})`, transformOrigin: 'bottom right' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(0,0,0,0.55)', border: `1px solid rgba(255,255,255,${0.18 + badgeGlow * 0.3})`,
              borderRadius: 24, padding: '5px 14px 5px 8px', backdropFilter: 'blur(10px)',
              boxShadow: `0 0 ${12 + badgeGlow * 20}px rgba(124,58,237,${badgeGlow})`,
            }}>
              <div style={{ width: 20, height: 20, background: ACCENT_GRADIENT, borderRadius: 5, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.90)', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>Made with LumeSpec</span>
            </div>
          </div>

          {/* scanline overlay for screen feel */}
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)', pointerEvents: 'none' }} />
        </div>

        {/* arrow annotation */}
        <div style={{ position: 'absolute', bottom: -32, right: 80, opacity: arrowOpacity, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>↗</span>
          <span style={{ fontSize: 13, color: 'rgba(167,139,250,0.9)', fontWeight: 600 }}>Made with LumeSpec badge</span>
        </div>

        {/* ready label */}
        <div style={{ position: 'absolute', bottom: -68, left: 0, right: 0, textAlign: 'center', opacity: readyOpacity }}>
          <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 600 }}>✅ MP4 ready · 1280 × 720 · H.264</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 5: History Vault (frames 0–90) ────────────────────────────────────
const HISTORY_ITEMS = [
  { url: 'stripe.com',    time: 'Just now',  thumb: '#1e1b4b', duration: '30s' },
  { url: 'vercel.com',    time: '2h ago',    thumb: '#0f172a', duration: '10s' },
  { url: 'linear.app',   time: 'Yesterday', thumb: '#162032', duration: '30s' },
];

const Scene5History: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });
  const headerY = interpolate(frame, [0, 16], [14, 0], { extrapolateRight: 'clamp' });

  // download button highlight pulse on first row
  const btnPulse = frame > 50
    ? 0.5 + 0.5 * Math.abs(Math.sin(((frame - 50) / 22) * Math.PI))
    : 0;

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(124,58,237,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div style={{ position: 'relative', width: 760 }}>
        {/* header */}
        <div style={{ opacity: headerOpacity, transform: `translateY(${headerY}px)`, marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 24 }}>🗂️</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em' }}>History Vault</div>
              <div style={{ fontSize: 13, color: MUTED }}>Every video — stored, searchable, re-renderable</div>
            </div>
          </div>
        </div>

        {/* rows */}
        {HISTORY_ITEMS.map(({ url, time, thumb, duration }, i) => {
          const rowDelay = 12 + i * 12;
          const s = spring({ frame: frame - rowDelay, fps, config: { damping: 18, stiffness: 120, mass: 0.8 } });
          const rowOpacity = interpolate(s, [0, 1], [0, 1]);
          const rowY = interpolate(s, [0, 1], [18, 0]);
          const isFirst = i === 0;

          return (
            <div key={url} style={{ opacity: rowOpacity, transform: `translateY(${rowY}px)`, marginBottom: 12 }}>
              <div style={{ background: SURFACE, border: `1px solid ${isFirst ? 'rgba(124,58,237,0.40)' : BORDER}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* thumbnail */}
                <div style={{ width: 80, height: 45, background: thumb, borderRadius: 6, border: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 28, height: 2, background: ACCENT_GRADIENT, borderRadius: 1 }} />
                </div>

                {/* meta */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 3 }}>{url}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{duration} · {time}</div>
                </div>

                {/* actions */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    background: isFirst ? `rgba(124,58,237,${0.2 + btnPulse * 0.3})` : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${isFirst ? `rgba(124,58,237,${0.5 + btnPulse * 0.4})` : BORDER}`,
                    borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600,
                    color: isFirst ? 'rgba(167,139,250,1)' : MUTED,
                    boxShadow: isFirst ? `0 0 ${10 + btnPulse * 16}px rgba(124,58,237,${btnPulse * 0.5})` : 'none',
                  }}>↓ Download</div>
                  <div style={{ background: 'rgba(255,255,255,0.06)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, color: MUTED }}>⑂ Fork</div>
                </div>
              </div>
            </div>
          );
        })}

        {/* tagline */}
        {(() => {
          const tagOpacity = interpolate(frame, [70, 84], [0, 1], { extrapolateRight: 'clamp' });
          return (
            <div style={{ opacity: tagOpacity, textAlign: 'center', marginTop: 28 }}>
              <span style={{ fontSize: 14, color: MUTED }}>Your demo library </span>
              <span style={{ fontSize: 14, fontWeight: 600, background: ACCENT_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>evolves with your product.</span>
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
};

// ─── PromoComposition root (600 frames, 30fps = 20s) ─────────────────────────
// Scene durations (with 15-frame overlaps at each cut):
//  Scene 1: frames   0 – 104  (90 net)
//  Scene 2: frames  90 – 224  (120 net, starts 15f before S1 ends)
//  Scene 3: frames 210 – 374  (150 net)
//  Scene 4: frames 360 – 524  (150 net)
//  Scene 5: frames 510 – 599  (90 net)
// Sequences sum: 105 + 135 + 165 + 165 + 90 = 660  minus 4×15 = 600 ✓

const OVERLAP = 15;
const S1_DUR = 90;
const S2_DUR = 120;
const S3_DUR = 150;
const S4_DUR = 150;
const S5_DUR = 90;

export const PromoComposition: React.FC = () => {
  // Scene sequence start frames (each scene starts OVERLAP frames before previous ends)
  const s1Start = 0;
  const s2Start = s1Start + S1_DUR;
  const s3Start = s2Start + S2_DUR;
  const s4Start = s3Start + S3_DUR;
  const s5Start = s4Start + S4_DUR;

  const frame = useCurrentFrame();

  // Cross-fade opacity between scenes
  const fadeIn = (start: number) => interpolate(frame, [start, start + OVERLAP], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = (end: number) => interpolate(frame, [end, end + OVERLAP], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // Each scene gets its own local frame via Sequence
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Sequence from={s1Start} durationInFrames={S1_DUR + OVERLAP}>
        <AbsoluteFill style={{ opacity: frame <= s2Start + OVERLAP ? fadeIn(s1Start) : fadeOut(s1Start + S1_DUR) }}>
          <Scene1Input />
        </AbsoluteFill>
      </Sequence>

      <Sequence from={s2Start} durationInFrames={S2_DUR + OVERLAP}>
        <AbsoluteFill style={{ opacity: frame >= s3Start ? fadeOut(s2Start + S2_DUR) : fadeIn(s2Start) }}>
          <Scene2Crawl />
        </AbsoluteFill>
      </Sequence>

      <Sequence from={s3Start} durationInFrames={S3_DUR + OVERLAP}>
        <AbsoluteFill style={{ opacity: frame >= s4Start ? fadeOut(s3Start + S3_DUR) : fadeIn(s3Start) }}>
          <Scene3Cards />
        </AbsoluteFill>
      </Sequence>

      <Sequence from={s4Start} durationInFrames={S4_DUR + OVERLAP}>
        <AbsoluteFill style={{ opacity: frame >= s5Start ? fadeOut(s4Start + S4_DUR) : fadeIn(s4Start) }}>
          <Scene4Preview />
        </AbsoluteFill>
      </Sequence>

      <Sequence from={s5Start} durationInFrames={S5_DUR}>
        <AbsoluteFill style={{ opacity: fadeIn(s5Start) }}>
          <Scene5History />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
