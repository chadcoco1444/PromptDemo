import Link from 'next/link';
import { LandingBackdrop } from './LandingBackdrop';

export function LandingFinalCTA() {
  return (
    <LandingBackdrop>
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h2
          className="font-extrabold tracking-tight text-transparent bg-clip-text"
          style={{
            backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
            fontSize: 'clamp(32px, 4vw, 56px)',
            letterSpacing: '-0.02em',
          }}
        >
          Ready to ship it?
        </h2>
        <p className="mt-4 text-base text-gray-400">
          Free tier ships 30 seconds of render every month. No card to start.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-md bg-brand-500 hover:bg-brand-600 text-white px-6 py-3 font-semibold text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a14]"
            style={{ boxShadow: '0 0 32px rgba(109, 40, 217, 0.6)' }}
          >
            Start for free →
          </Link>
        </div>
      </div>
    </LandingBackdrop>
  );
}
