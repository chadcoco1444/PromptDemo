'use client';

import type { JobInput } from '../../lib/types';
import { LandingBackdrop } from './LandingBackdrop';
import { PreviewForm } from './PreviewForm';

export interface LandingHeroProps {
  onAuthedSubmit: (input: JobInput) => Promise<{ jobId: string }>;
}

export function LandingHero({ onAuthedSubmit }: LandingHeroProps) {
  return (
    <LandingBackdrop className="min-h-screen">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 pt-16 pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* LEFT — copy + form (5/12) */}
          <div className="lg:col-span-5">
            <div className="text-[11px] tracking-[0.18em] text-brand-300 uppercase font-medium">
              PromptDemo
            </div>
            <h1
              className="mt-3 font-extrabold leading-[1.05] tracking-tight text-transparent bg-clip-text"
              style={{
                backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
                fontSize: 'clamp(40px, 6vw, 72px)',
              }}
            >
              From URL
              <br />
              to demo video.
              <br />
              Sixty seconds.
            </h1>
            <p className="mt-5 text-base lg:text-lg text-gray-400 max-w-md leading-relaxed">
              Paste a link, pick an intent, ship a polished MP4.
              <br />
              Powered by Claude + Remotion.
            </p>
            <div className="mt-8">
              <PreviewForm onAuthedSubmit={onAuthedSubmit} />
            </div>
          </div>

          {/* RIGHT — looping demo video (7/12) */}
          <div className="lg:col-span-7">
            <div
              className="relative rounded-2xl overflow-hidden ring-1 ring-violet-500/20 shadow-2xl shadow-violet-500/10"
              style={{ aspectRatio: '16 / 9' }}
            >
              {/* Decorative violet glow halo */}
              <div
                aria-hidden="true"
                className="absolute -inset-4 rounded-3xl opacity-50 blur-3xl"
                style={{ background: 'radial-gradient(ellipse, rgba(109, 40, 217, 0.5), transparent 70%)' }}
              />
              <video
                className="relative w-full h-full object-cover"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-label="PromptDemo example output — vercel.com rendered as a 60-second demo video"
              >
                <source src="/landing-hero-demo.mp4" type="video/mp4" />
              </video>
            </div>
            <p className="mt-3 text-xs text-gray-500 italic text-center">
              Made with PromptDemo. Source: vercel.com
            </p>
          </div>
        </div>
      </div>
    </LandingBackdrop>
  );
}
