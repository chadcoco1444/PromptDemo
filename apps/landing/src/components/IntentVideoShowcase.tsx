import { useEffect, useRef, useState } from 'react';
import { INTENT_VIDEOS, type IntentVideo } from '../data/intentVideos';

function VideoCard({ video }: { video: IntentVideo }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [shouldPlay, setShouldPlay] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setShouldPlay(entry.isIntersecting);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (shouldPlay) el.play().catch(() => {});
    else el.pause();
  }, [shouldPlay]);

  return (
    <article className="border border-gray-700 rounded-lg overflow-hidden bg-gray-900 hover:border-purple-500 transition">
      <div className="aspect-video bg-black">
        <video
          ref={ref}
          src={`${import.meta.env.BASE_URL}showcase/${video.filename}`}
          muted
          loop
          playsInline
          preload="metadata"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-6">
        <div className="text-sm uppercase tracking-wide text-gray-400 flex items-center gap-2">
          <span>{video.emoji}</span>
          <span>{video.label}</span>
        </div>
        <div className="mt-2 text-xl font-bold">{video.headline}</div>
        <p className="mt-2 text-sm text-gray-400">{video.description}</p>
      </div>
    </article>
  );
}

export function IntentVideoShowcase() {
  return (
    <section className="py-16 px-6 max-w-6xl mx-auto">
      <header className="text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-bold">Same URL. Three intents. Three videos.</h2>
        <p className="mt-3 text-gray-400">
          We crawled <code className="text-purple-400">vercel.com</code> once, then steered the storyboard
          AI three different ways. Scroll each card — it autoplays in view.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {INTENT_VIDEOS.map((v) => (
          <VideoCard key={v.intent} video={v} />
        ))}
      </div>
    </section>
  );
}
