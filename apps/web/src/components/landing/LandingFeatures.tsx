'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Feature {
  icon: ReactNode;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: '✨',
    title: 'Zero-Touch Storyboarding',
    body: 'Paste a URL. Claude crawls every section, picks the moments worth showing, and sequences them into scenes. You stay out of the timeline.',
  },
  {
    icon: '🧭',
    title: 'Intent-Driven Directing',
    body: 'Tell us the vibe — marketing trailer, tutorial walkthrough, default. Our pacing profiles auto-tune scene durations, transitions, and rhythm. Same crawl, four different cuts.',
  },
  {
    icon: '🎬',
    title: 'Studio-Grade Polish',
    body: 'Spring physics. Frame-perfect timing. Real video output, not slideshow exports. Every shot rendered with Remotion at 30fps to broadcast-grade MP4.',
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.45,
      delay: i * 0.1,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

export function LandingFeatures() {
  return (
    <section style={{ background: '#0a0a0a' }} className="py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto"
        >
          <h2
            className="font-bold tracking-tight text-transparent bg-clip-text"
            style={{
              backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
              fontSize: 'clamp(28px, 3.5vw, 44px)',
              letterSpacing: '-0.02em',
            }}
          >
            Ship the demo, not the screenshot.
          </h2>
          <p className="mt-3 text-sm italic text-gray-400">
            Three things make LumeSpec different from the slideshow exporters.
          </p>
        </motion.div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {FEATURES.map((f, i) => (
            <motion.article
              key={f.title}
              custom={i}
              variants={cardVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-40px' }}
              whileHover={{ scale: 1.02 }}
              className="rounded-2xl p-8 ring-1 ring-white/10 bg-white/5 backdrop-blur-md cursor-default"
              style={{
                transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow =
                  '0 0 40px rgba(109,40,217,0.28), inset 0 0 0 1px rgba(139,92,246,0.4)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = '';
              }}
            >
              <div
                aria-hidden="true"
                className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-2xl"
              >
                {f.icon}
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">{f.title}</h3>
              <p className="mt-3 text-sm text-gray-400 leading-relaxed">{f.body}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
