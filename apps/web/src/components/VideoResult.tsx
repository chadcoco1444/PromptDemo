'use client';

import { motion } from 'framer-motion';

export interface VideoResultProps {
  videoUrl: string;
  resolvedUrl: string;
}

export function VideoResult({ videoUrl, resolvedUrl }: VideoResultProps) {
  return (
    <div className="space-y-6">
      {/* Floating video with glow halo */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 80, damping: 20 }}
        className="relative"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          {/* Outer glow */}
          <div
            aria-hidden="true"
            className="absolute -inset-6 rounded-3xl blur-3xl opacity-50"
            style={{ background: 'radial-gradient(ellipse, rgba(109,40,217,0.5), transparent 70%)' }}
          />
          {/* Inner glow */}
          <div
            aria-hidden="true"
            className="absolute -inset-2 rounded-2xl blur-xl opacity-40"
            style={{ background: 'radial-gradient(ellipse, rgba(167,139,250,0.3), transparent 70%)' }}
          />
          <video
            src={resolvedUrl}
            controls
            className="relative w-full rounded-2xl ring-1 ring-violet-500/30"
            style={{ background: '#000' }}
          />
        </motion.div>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="flex items-center gap-4"
      >
        <motion.a
          href={resolvedUrl}
          download
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          className="bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a] transition-colors"
          style={{ boxShadow: '0 0 24px rgba(109,40,217,0.45)' }}
        >
          Download MP4
        </motion.a>
        <code className="text-xs text-gray-600 break-all font-mono">{videoUrl}</code>
      </motion.div>
    </div>
  );
}
