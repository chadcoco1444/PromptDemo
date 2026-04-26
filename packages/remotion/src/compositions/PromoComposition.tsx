import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Sequence } from 'remotion';

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

// ─── Scene 1: URL input + typing animation ───────────────────────────────────
const TARGET_URL = 'https://stripe.com';
const INTENT_TEXT = 'Showcase payment flow with confidence';

const Scene1Input: React.FC = () => {
  const frame = useCurrentFrame();

  const urlCharCount = Math.max(0, Math.floor((frame - 20) / 2.5));
  const urlTyped = TARGET_URL.slice(0, urlCharCount);
  const showUrlCursor = frame < 20 + TARGET_URL.length * 2.5 + 8;

  const intentStart = 20 + TARGET_URL.length * 2.5 + 12;
  const intentCharCount = Math.max(0, Math.floor((frame - intentStart) / 2));
  const intentTyped = INTENT_TEXT.slice(0, intentCharCount);
  const showIntentCursor = frame >= intentStart && frame < intentStart + INTENT_TEXT.length * 2 + 10;

  const btnOpacity = frame > 75 ? interpolate(frame, [75, 85], [0.4, 1], { extrapolateRight: 'clamp' }) : 0.4;
  const btnScale = frame > 78 ? interpolate(frame, [78, 88], [1, 1.04], { extrapolateRight: 'clamp' }) : 1;

  const headerOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const headerY = interpolate(frame, [0, 18], [16, 0], { extrapolateRight: 'clamp' });

  const cardOpacity = interpolate(frame, [8, 28], [0, 1], { extrapolateRight: 'clamp' });
  const cardY = interpolate(frame, [8, 28], [20, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(124,58,237,0.12) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div style={{ position: 'relative', width: 640, opacity: cardOpacity, transform: `translateY(${cardY}px)` }}>
        <div style={{ opacity: headerOpacity, transform: `translateY(${headerY}px)`, marginBottom: 28, textAlign: 'center' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'rgba(124,58,237,0.18)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 20, padding: '6px 16px', fontSize: 13, color: 'rgba(167,139,250,1)', fontWeight: 500 }}>
            <span style={{ fontSize: 16 }}>✦</span> AI Demo Generator
          </span>
        </div>

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

// ─── Scene 2: Crawl → Storyboard JSON flash ──────────────────────────────────
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

  const jsonOpacity = interpolate(frame, [72, 88], [0, 1], { extrapolateRight: 'clamp' });
  const jsonScale = interpolate(frame, [72, 88], [0.92, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: '#050508', display: 'flex', fontFamily: FONT }}>
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

      <div style={{ width: '50%', padding: '40px 32px', display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: jsonOpacity, transform: `scale(${jsonScale})` }}>
        <div style={{ fontSize: 12, color: 'rgba(167,139,250,0.8)', marginBottom: 16, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>Storyboard JSON</div>
        <div style={{ background: 'rgba(124,58,237,0.10)', border: '1px solid rgba(124,58,237,0.30)', borderRadius: 12, padding: '20px 20px', fontFamily: 'monospace', fontSize: 12, color: '#c4b5fd', lineHeight: 1.8, whiteSpace: 'pre' }}>
          {JSON_SNIPPET}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 3: Scene gallery (8 shipped scene types) ──────────────────────────
const SCENE_CARDS = [
  { icon: '🦸', label: 'HeroRealShot',   desc: 'Full-bleed hero image + headline',  delay: 0 },
  { icon: '⚡', label: 'BentoGrid',      desc: 'Feature grid · up to 6 items',      delay: 12 },
  { icon: '✨', label: 'FeatureCallout', desc: 'Product detail + screenshot',        delay: 24 },
  { icon: '🎯', label: 'CTA',           desc: 'Action-driving closer scene',         delay: 36 },
  { icon: '📊', label: 'StatsCounter',  desc: 'Animated metric rollup',              delay: 48 },
  { icon: '💬', label: 'ReviewMarquee', desc: 'Scrolling testimonials strip',        delay: 60 },
  { icon: '🏷️', label: 'LogoCloud',     desc: 'Infinite partner logo marquee',       delay: 72 },
  { icon: '💻', label: 'CodeToUI',      desc: 'Typewriter code → live screenshot',  delay: 84 },
];

const Scene3Cards: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const headerOpacity = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });
  const headerY = interpolate(frame, [0, 16], [14, 0], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(124,58,237,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div style={{ position: 'relative', width: 1040 }}>
        <div style={{ opacity: headerOpacity, transform: `translateY(${headerY}px)`, textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontSize: 13, color: 'rgba(167,139,250,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>AI Storyboard</div>
          <div style={{ fontSize: 30, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>8 Scene Types. Rendered Scene by Scene.</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {SCENE_CARDS.map(({ icon, label, desc, delay }) => {
            const s = spring({ frame: frame - delay, fps, config: { damping: 16, stiffness: 110, mass: 0.9 } });
            const cardOpacity = interpolate(s, [0, 1], [0, 1]);
            const cardY = interpolate(s, [0, 1], [28, 0]);
            const cardScale = interpolate(s, [0, 1], [0.88, 1]);
            const glowOpacity = interpolate(frame, [delay + 30, delay + 60], [0, 0.7], { extrapolateRight: 'clamp' });

            return (
              <div key={label} style={{ opacity: cardOpacity, transform: `translateY(${cardY}px) scale(${cardScale})` }}>
                <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 14, padding: '20px 16px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                  <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 0%, rgba(124,58,237,${glowOpacity * 0.25}), transparent 70%)` }} />
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 5 }}>{label}</div>
                  <div style={{ fontSize: 10, color: MUTED, lineHeight: 1.5 }}>{desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        {(() => {
          const barStart = 95;
          const barWidth = interpolate(frame, [barStart, barStart + 50], [0, 100], { extrapolateRight: 'clamp' });
          const barOpacity = interpolate(frame, [barStart, barStart + 8], [0, 1], { extrapolateRight: 'clamp' });
          return (
            <div style={{ marginTop: 36, opacity: barOpacity }}>
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

// ─── Scene 4: Simulated video preview with Pill Badge ────────────────────────
const Scene4Preview: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const frameIn = spring({ frame, fps, config: { damping: 18, stiffness: 100, mass: 1 } });
  const containerScale = interpolate(frameIn, [0, 1], [0.9, 1]);
  const containerOpacity = interpolate(frameIn, [0, 1], [0, 1]);

  const badgeScale = frame > 60
    ? 1 + 0.03 * Math.sin(((frame - 60) / 18) * Math.PI * 2)
    : 1;
  const badgeGlow = frame > 60
    ? 0.4 + 0.3 * Math.sin(((frame - 60) / 18) * Math.PI * 2)
    : 0;

  const arrowOpacity = interpolate(frame, [70, 86], [0, 1], { extrapolateRight: 'clamp' });
  const readyOpacity = interpolate(frame, [100, 115], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(79,70,229,0.12) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      <div style={{ position: 'relative', opacity: containerOpacity, transform: `scale(${containerScale})` }}>
        <div style={{ width: 720, height: 405, background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 40%, #1e1b4b 100%)', border: `1px solid ${BORDER}`, borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 42, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', textAlign: 'center', lineHeight: 1.2 }}>Payments<br />Built for the<br />Internet</div>
            <div style={{ width: 64, height: 3, background: ACCENT_GRADIENT, borderRadius: 2 }} />
          </div>

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

          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px)', pointerEvents: 'none' }} />
        </div>

        <div style={{ position: 'absolute', bottom: -32, right: 80, opacity: arrowOpacity, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 22 }}>↗</span>
          <span style={{ fontSize: 13, color: 'rgba(167,139,250,0.9)', fontWeight: 600 }}>Made with LumeSpec badge</span>
        </div>

        <div style={{ position: 'absolute', bottom: -68, left: 0, right: 0, textAlign: 'center', opacity: readyOpacity }}>
          <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 600 }}>✅ MP4 ready · 1280 × 720 · H.264</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 5: History Vault ───────────────────────────────────────────────────
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

  const btnPulse = frame > 50
    ? 0.5 + 0.5 * Math.abs(Math.sin(((frame - 50) / 22) * Math.PI))
    : 0;

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(124,58,237,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div style={{ position: 'relative', width: 760 }}>
        <div style={{ opacity: headerOpacity, transform: `translateY(${headerY}px)`, marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 24 }}>🗂️</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em' }}>History Vault</div>
              <div style={{ fontSize: 13, color: MUTED }}>Every video — stored, searchable, re-renderable</div>
            </div>
          </div>
        </div>

        {HISTORY_ITEMS.map(({ url, time, thumb, duration }, i) => {
          const rowDelay = 12 + i * 12;
          const s = spring({ frame: frame - rowDelay, fps, config: { damping: 18, stiffness: 120, mass: 0.8 } });
          const rowOpacity = interpolate(s, [0, 1], [0, 1]);
          const rowY = interpolate(s, [0, 1], [18, 0]);
          const isFirst = i === 0;

          return (
            <div key={url} style={{ opacity: rowOpacity, transform: `translateY(${rowY}px)`, marginBottom: 12 }}>
              <div style={{ background: SURFACE, border: `1px solid ${isFirst ? 'rgba(124,58,237,0.40)' : BORDER}`, borderRadius: 12, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 80, height: 45, background: thumb, borderRadius: 6, border: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 28, height: 2, background: ACCENT_GRADIENT, borderRadius: 1 }} />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 3 }}>{url}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{duration} · {time}</div>
                </div>

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

// ─── Scene 6: LogoCloud showcase ─────────────────────────────────────────────
const LOGO_NAMES = ['GitHub', 'Stripe', 'Linear', 'Vercel', 'Loom', 'Figma', 'Notion', 'Zapier', 'Segment', 'Amplitude'];
const PILL_WIDTH = 152; // px per pill slot including gap

const Scene6LogoCloud: React.FC = () => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const headerOpacity = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' });
  const headerY = interpolate(frame, [0, 18], [14, 0], { extrapolateRight: 'clamp' });
  const taglineOpacity = interpolate(frame, [55, 70], [0, 1], { extrapolateRight: 'clamp' });

  const items = [...LOGO_NAMES, ...LOGO_NAMES, ...LOGO_NAMES];
  const totalWidth = LOGO_NAMES.length * PILL_WIDTH;
  const offset = (frame * 1.5) % totalWidth;

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT, overflow: 'hidden', opacity: fadeIn }}>
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(124,58,237,0.08) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 48 }}>
        <div style={{ opacity: headerOpacity, transform: `translateY(${headerY}px)`, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'rgba(167,139,250,0.8)', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 10 }}>LogoCloud Scene</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em' }}>Social Proof, Auto-Crawled</div>
        </div>

        <div style={{ width: '100%', overflow: 'hidden', position: 'relative' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 140, background: `linear-gradient(to right, ${BG}, transparent)`, zIndex: 2 }} />
          <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 140, background: `linear-gradient(to left, ${BG}, transparent)`, zIndex: 2 }} />
          <div style={{ display: 'flex', gap: 16, transform: `translateX(${-offset}px)`, width: 'max-content' }}>
            {items.map((name, i) => (
              <div key={i} style={{
                background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 12,
                padding: '14px 28px', whiteSpace: 'nowrap', flexShrink: 0,
                fontSize: 16, fontWeight: 600, color: TEXT,
              }}>
                {name}
              </div>
            ))}
          </div>
        </div>

        <div style={{ opacity: taglineOpacity, textAlign: 'center' }}>
          <span style={{ fontSize: 14, color: MUTED }}>Crawl once. </span>
          <span style={{ fontSize: 14, fontWeight: 600, background: ACCENT_GRADIENT, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Partner logos extracted and animated automatically.</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── Scene 7: CodeToUI showcase ──────────────────────────────────────────────
const CODE_SNIPPET = `curl -X POST https://api.yourapp.com \\
  -H "Authorization: Bearer sk-..." \\
  -d '{
    "url": "https://stripe.com",
    "intent": "payment flow demo"
  }'`;

const Scene7CodeToUI: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftFade = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });
  const headerOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: 'clamp' });

  const TYPE_START = 20;
  const TYPE_END = 90;
  const charsToShow = Math.floor(
    interpolate(frame, [TYPE_START, TYPE_END], [0, CODE_SNIPPET.length], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  );
  const showCursor = frame >= TYPE_START && frame < TYPE_END;
  const cursorBlink = frame % 12 < 6;

  const rightProgress = spring({ frame: frame - 85, fps, config: { stiffness: 120, damping: 22 } });
  const rightX = interpolate(rightProgress, [0, 1], [60, 0]);
  const rightOpacity = interpolate(rightProgress, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{ background: '#050508', display: 'flex', fontFamily: FONT }}>
      <div style={{ width: '50%', padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', opacity: leftFade }}>
        <div style={{ fontSize: 12, color: 'rgba(167,139,250,0.8)', marginBottom: 16, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600, opacity: headerOpacity }}>CodeToUI Scene</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: TEXT, letterSpacing: '-0.01em', marginBottom: 28, lineHeight: 1.3 }}>
          From API call<br />to live demo
        </div>
        <div style={{ background: 'rgba(0,0,0,0.6)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '20px 22px', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.7, color: '#c4b5fd', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {CODE_SNIPPET.slice(0, charsToShow)}
          {showCursor && cursorBlink && <span style={{ display: 'inline-block', width: 2, height: 16, background: PURPLE, marginLeft: 1, verticalAlign: 'text-bottom' }} />}
        </div>
      </div>

      <div style={{ width: '50%', padding: '48px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: rightOpacity, transform: `translateX(${rightX}px)` }}>
        <div style={{ background: SURFACE, border: '1px solid rgba(124,58,237,0.35)', borderRadius: 14, padding: '24px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f56' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#ffbd2e' }} />
            <div style={{ width: 11, height: 11, borderRadius: '50%', background: '#27c93f' }} />
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 6, padding: '4px 10px', marginLeft: 6, fontSize: 11, color: MUTED, fontFamily: 'monospace' }}>stripe.com</div>
          </div>
          <div style={{ height: 190, background: 'linear-gradient(135deg, #1e1b4b, #0f172a)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', textAlign: 'center', lineHeight: 1.3 }}>Payments<br />Built for the Internet</div>
            <div style={{ width: 48, height: 3, background: ACCENT_GRADIENT, borderRadius: 2 }} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <div style={{ background: ACCENT_GRADIENT, borderRadius: 8, padding: '8px 16px', fontSize: 12, fontWeight: 600, color: '#fff' }}>Get started</div>
            <div style={{ background: SURFACE, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 16px', fontSize: 12, color: MUTED }}>↓ Download MP4</div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─── PromoComposition root (7 scenes, duration-aware) ────────────────────────
// Base design: 900 frames = 30s @ 30fps
// Scene weights: S1=90 S2=120 S3=150 S4=150 S5=90 S6=150 S7=150 → sum=900
// Scale factor = durationInFrames / 900 (2.0 for 60s)

export const PromoComposition: React.FC = () => {
  const { durationInFrames, fps } = useVideoConfig();
  const BASE = 900;
  const scale = durationInFrames / BASE;
  const OVERLAP = Math.round(15 * scale);

  const S1_DUR = Math.round(90 * scale);
  const S2_DUR = Math.round(120 * scale);
  const S3_DUR = Math.round(150 * scale);
  const S4_DUR = Math.round(150 * scale);
  const S5_DUR = Math.round(90 * scale);
  const S6_DUR = Math.round(150 * scale);
  // S7 absorbs any rounding remainder so sequences sum exactly to durationInFrames
  const S7_DUR = durationInFrames - (S1_DUR + S2_DUR + S3_DUR + S4_DUR + S5_DUR + S6_DUR);

  const s1Start = 0;
  const s2Start = s1Start + S1_DUR;
  const s3Start = s2Start + S2_DUR;
  const s4Start = s3Start + S3_DUR;
  const s5Start = s4Start + S4_DUR;
  const s6Start = s5Start + S5_DUR;
  const s7Start = s6Start + S6_DUR;

  const frame = useCurrentFrame();

  const fadeIn  = (start: number) => interpolate(frame, [start, start + OVERLAP], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fadeOut = (end: number)   => interpolate(frame, [end,   end   + OVERLAP], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

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

      <Sequence from={s5Start} durationInFrames={S5_DUR + OVERLAP}>
        <AbsoluteFill style={{ opacity: frame >= s6Start ? fadeOut(s5Start + S5_DUR) : fadeIn(s5Start) }}>
          <Scene5History />
        </AbsoluteFill>
      </Sequence>

      <Sequence from={s6Start} durationInFrames={S6_DUR + OVERLAP}>
        <AbsoluteFill style={{ opacity: frame >= s7Start ? fadeOut(s6Start + S6_DUR) : fadeIn(s6Start) }}>
          <Scene6LogoCloud />
        </AbsoluteFill>
      </Sequence>

      <Sequence from={s7Start} durationInFrames={S7_DUR}>
        <AbsoluteFill style={{ opacity: fadeIn(s7Start) }}>
          <Scene7CodeToUI />
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
