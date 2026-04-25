'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { LandingBackdrop } from './LandingBackdrop';

export function LandingFinalCTA() {
  return (
    <LandingBackdrop>
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="font-extrabold tracking-tight text-transparent bg-clip-text"
          style={{
            backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
            fontSize: 'clamp(32px, 4vw, 56px)',
            letterSpacing: '-0.02em',
          }}
        >
          Ready to ship it?
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-4 text-base text-gray-400"
        >
          Free tier ships 30 seconds of render every month. No card to start.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.28 }}
          className="mt-8 flex justify-center"
        >
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-md bg-brand-500 hover:bg-brand-600 text-white px-6 py-3 font-semibold text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
              style={{ boxShadow: '0 0 32px rgba(109, 40, 217, 0.6)' }}
            >
              Start for free →
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </LandingBackdrop>
  );
}
