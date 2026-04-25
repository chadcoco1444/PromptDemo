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
    body:
      'Paste a URL. Claude crawls every section, picks the moments worth showing, and sequences them into scenes. You stay out of the timeline.',
  },
  {
    icon: '🧭',
    title: 'Intent-Driven Directing',
    body:
      'Tell us the vibe — marketing trailer, tutorial walkthrough, default. Our pacing profiles auto-tune scene durations, transitions, and rhythm. Same crawl, four different cuts.',
  },
  {
    icon: '🎬',
    title: 'Studio-Grade Polish',
    body:
      'Spring physics. Frame-perfect timing. Real video output, not slideshow exports. Every shot rendered with Remotion at 30fps to broadcast-grade MP4.',
  },
];

export function LandingFeatures() {
  return (
    <section className="bg-[#0a0a14] py-24">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto">
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
            Three things make PromptDemo different from the slideshow exporters.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="rounded-2xl p-8 ring-1 ring-white/10 bg-white/5 backdrop-blur-md transition-all duration-200 hover:-translate-y-1 hover:ring-violet-500/30"
            >
              <div
                aria-hidden="true"
                className="h-12 w-12 rounded-xl bg-brand-500 flex items-center justify-center text-2xl"
              >
                {f.icon}
              </div>
              <h3 className="mt-5 text-xl font-bold text-white">{f.title}</h3>
              <p className="mt-3 text-sm text-gray-400 leading-relaxed">{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
