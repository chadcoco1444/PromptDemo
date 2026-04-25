'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { LandingBackdrop } from './LandingBackdrop';

const WORDS = [
  { text: 'From URL', delay: 0.1 },
  { text: 'to demo video.', delay: 0.2 },
  { text: 'In sixty seconds.', delay: 0.3 },
];

export function LandingHero() {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();
  const { status } = useSession();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) { setError('Paste a URL to start'); return; }
    try { new URL(trimmed); } catch { setError('Please enter a valid URL'); return; }
    const dest = `/create?url=${encodeURIComponent(trimmed)}`;
    if (status === 'authenticated') {
      router.push(dest);
    } else {
      window.location.href = `/auth/signin?callbackUrl=${encodeURIComponent(dest)}`;
    }
  };

  return (
    <LandingBackdrop className="min-h-screen flex flex-col items-center justify-center">
      <div className="w-full max-w-5xl mx-auto px-6 text-center pt-24 pb-16">
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-[11px] tracking-[0.18em] text-brand-300 uppercase font-medium"
        >
          LumeSpec · Claude + Remotion
        </motion.p>

        {/* Mega Headline */}
        <h1 className="mt-6">
          {WORDS.map(({ text, delay }) => (
            <motion.span
              key={text}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
              className="block font-extrabold leading-[1.05] tracking-tight text-transparent bg-clip-text"
              style={{
                backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
                fontSize: 'clamp(48px, 8vw, 96px)',
              }}
            >
              {text}
            </motion.span>
          ))}
        </h1>

        {/* Floating Video */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.45 }}
          className="mt-12"
        >
          <motion.div
            animate={{ y: [0, -12, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="relative inline-block w-full"
            style={{ maxWidth: 860 }}
          >
            {/* Outer glow */}
            <div
              aria-hidden="true"
              className="absolute -inset-8 rounded-3xl blur-3xl"
              style={{ background: 'radial-gradient(ellipse, rgba(109,40,217,0.55), transparent 70%)' }}
            />
            {/* Inner glow */}
            <div
              aria-hidden="true"
              className="absolute -inset-3 rounded-3xl blur-xl opacity-60"
              style={{ background: 'radial-gradient(ellipse, rgba(167,139,250,0.3), transparent 70%)' }}
            />
            {/* Video card */}
            <div
              className="relative rounded-2xl overflow-hidden ring-1 ring-violet-500/30 shadow-2xl shadow-violet-900/40"
              style={{ aspectRatio: '16/9' }}
            >
              <video
                className="w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-label="LumeSpec — paste a URL, watch the AI pipeline generate your demo video"
              >
                <source src="/landing-hero-demo.mp4" type="video/mp4" />
              </video>
            </div>
          </motion.div>
        </motion.div>

        {/* URL Input Bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.85 }}
          className="mt-10"
        >
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 max-w-lg mx-auto"
          >
            <input
              type="text"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError(''); }}
              placeholder="https://your-product.com"
              className="flex-1 rounded-lg bg-white/5 border border-white/15 text-white placeholder-gray-500 px-4 py-3 text-sm focus:outline-none focus:border-violet-500/70 focus:ring-1 focus:ring-violet-500/30 transition-all"
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg bg-brand-500 hover:bg-brand-600 active:scale-95 text-white px-5 py-3 font-semibold text-sm transition-all"
              style={{ boxShadow: '0 0 24px rgba(109,40,217,0.5)' }}
            >
              Start →
            </button>
          </form>
          {error && (
            <p className="mt-2 text-xs text-red-400 text-center">{error}</p>
          )}
          <p className="mt-2 text-xs text-gray-500">Free tier · No card required</p>
        </motion.div>
      </div>
    </LandingBackdrop>
  );
}
