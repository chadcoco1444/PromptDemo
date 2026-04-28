import { useEffect } from 'react';

const TALLY_FORM_ID = import.meta.env.VITE_TALLY_FORM_ID ?? '';

export function TallyEmbed() {
  useEffect(() => {
    // Tally widget script attaches itself to .tally-iframe elements.
    // Only inject once even if component re-mounts (StrictMode double-renders).
    if (document.querySelector('script[src="https://tally.so/widgets/embed.js"]')) return;
    const script = document.createElement('script');
    script.src = 'https://tally.so/widgets/embed.js';
    script.async = true;
    document.body.appendChild(script);
  }, []);

  if (!TALLY_FORM_ID) {
    return (
      <section id="waitlist" className="py-24 bg-black text-white px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-4">Get early access</h2>
          <p className="text-gray-400 mb-6">
            Waitlist form coming soon. Set <code className="font-mono">VITE_TALLY_FORM_ID</code> at build time to enable.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="waitlist" className="py-24 bg-black text-white px-6">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-4">Get early access</h2>
        <p className="text-xl text-gray-400 text-center mb-12">
          Be the first to know when LumeSpec opens to public.
        </p>
        <iframe
          src={`https://tally.so/embed/${TALLY_FORM_ID}?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1`}
          loading="lazy"
          width="100%"
          height="500"
          title="LumeSpec waitlist"
          className="border-0"
        />
      </div>
    </section>
  );
}
