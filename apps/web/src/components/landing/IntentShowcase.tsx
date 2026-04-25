'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const INTENTS = [
  {
    id: 'marketing',
    label: 'Marketing',
    emoji: '🚀',
    tagline: 'High-energy. Punchy. Built to convert.',
    description:
      'Fast cuts, bold transitions, feature highlights in the opening seconds. Perfect for social ads, product launches, and cold outreach.',
    pacing: '10–30s',
    scenes: [
      { type: 'HeroRealShot', bg: '#6d28d9' },
      { type: 'TextPunch', bg: '#7c3aed' },
      { type: 'FeatureCallout', bg: '#5b21b6' },
      { type: 'CTA', bg: '#4c1d95' },
    ],
    accent: '#7c3aed',
    accentLight: 'rgba(124,58,237,0.12)',
    borderColor: 'rgba(124,58,237,0.25)',
  },
  {
    id: 'tutorial',
    label: 'Tutorial',
    emoji: '🎓',
    tagline: 'Step-by-step. Clear. Educational.',
    description:
      'Browser scrolls, measured pacing, callout-heavy structure. Ideal for onboarding flows, help articles, and docs site demos.',
    pacing: '30–60s',
    scenes: [
      { type: 'SmoothScroll', bg: '#0369a1' },
      { type: 'FeatureCallout', bg: '#0284c7' },
      { type: 'FeatureCallout', bg: '#0ea5e9' },
      { type: 'SmoothScroll', bg: '#0369a1' },
      { type: 'CTA', bg: '#075985' },
    ],
    accent: '#0ea5e9',
    accentLight: 'rgba(14,165,233,0.12)',
    borderColor: 'rgba(14,165,233,0.25)',
  },
  {
    id: 'deepdive',
    label: 'Deep-dive',
    emoji: '🔍',
    tagline: 'Comprehensive. Exhaustive. Complete.',
    description:
      'More scenes, longer durations, full feature coverage from hero to CTA. Built for investor decks, sales calls, and in-depth walkthroughs.',
    pacing: '60s',
    scenes: [
      { type: 'HeroRealShot', bg: '#065f46' },
      { type: 'SmoothScroll', bg: '#047857' },
      { type: 'FeatureCallout', bg: '#059669' },
      { type: 'TextPunch', bg: '#10b981' },
      { type: 'FeatureCallout', bg: '#059669' },
      { type: 'SmoothScroll', bg: '#047857' },
      { type: 'CTA', bg: '#064e3b' },
    ],
    accent: '#10b981',
    accentLight: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.25)',
  },
] as const;

export function IntentShowcase() {
  const [active, setActive] = useState(0);
  const current = INTENTS[active]!;

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5 }}
      className="py-24"
      style={{ background: '#0a0a0a' }}
    >
      <div className="max-w-5xl mx-auto px-6">
        {/* Heading */}
        <div className="text-center mb-12">
          <h2
            className="font-bold tracking-tight text-transparent bg-clip-text"
            style={{
              backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
              fontSize: 'clamp(28px, 3.5vw, 44px)',
              letterSpacing: '-0.02em',
            }}
          >
            Same URL. Four different cuts.
          </h2>
          <p className="mt-3 text-sm text-gray-400 italic">
            Pick your intent. Claude auto-tunes pacing, rhythm, and scene order.
          </p>
        </div>

        {/* Tab strip */}
        <div className="flex gap-2 justify-center mb-10">
          {INTENTS.map((intent, i) => (
            <motion.button
              key={intent.id}
              onClick={() => setActive(i)}
              whileTap={{ scale: 0.95 }}
              className="relative px-5 py-2.5 rounded-full text-sm font-medium transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              style={{ color: active === i ? '#fff' : '#9ca3af' }}
            >
              {active === i && (
                <motion.span
                  layoutId="intent-indicator"
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: current.accentLight,
                    boxShadow: `0 0 20px ${current.accent}50`,
                  }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <span className="relative">
                {intent.emoji} {intent.label}
              </span>
            </motion.button>
          ))}
        </div>

        {/* Preview panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl p-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-center"
            style={{
              background: 'rgba(255,255,255,0.025)',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${current.borderColor}`,
            }}
          >
            {/* Left: text description */}
            <div>
              <p className="text-xl font-bold text-white leading-snug">
                {current.tagline}
              </p>
              <p className="mt-3 text-sm text-gray-400 leading-relaxed">
                {current.description}
              </p>
              <div className="mt-5 flex items-center gap-2">
                <span className="text-xs text-gray-500">Typical duration:</span>
                <span
                  className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
                  style={{
                    background: current.accentLight,
                    color: current.accent,
                    border: `1px solid ${current.borderColor}`,
                  }}
                >
                  {current.pacing}
                </span>
              </div>
            </div>

            {/* Right: scene strip */}
            <div>
              <p className="text-[10px] text-gray-500 mb-3 uppercase tracking-widest">
                Scene sequence
              </p>
              <div className="flex flex-wrap gap-2">
                {current.scenes.map((scene, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0.75 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.055, type: 'spring', stiffness: 260, damping: 20 }}
                    className="rounded-md px-3 py-1.5 text-xs font-mono text-white/90"
                    style={{ background: scene.bg }}
                  >
                    {scene.type}
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
