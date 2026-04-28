export function Hero() {
  return (
    <section className="min-h-screen flex flex-col items-center justify-center bg-black text-white px-6 py-20">
      <video
        autoPlay
        muted
        loop
        playsInline
        className="w-full max-w-4xl rounded-lg shadow-2xl"
        src={`${import.meta.env.BASE_URL}demo-30s.mp4`}
      />
      <h1 className="mt-12 text-5xl md:text-6xl font-bold tracking-tight text-center">
        AI-directed demo videos.<br />
        From any URL. In any voice.
      </h1>
      <p className="mt-6 text-xl text-gray-300 max-w-2xl text-center">
        Paste a URL, pick your intent — get a polished 30s demo video.
        No editing software. No reshoots. No stale assets.
      </p>
      <div className="mt-12 flex flex-col sm:flex-row gap-4">
        <a
          href="#waitlist"
          className="bg-purple-600 hover:bg-purple-700 transition px-8 py-4 rounded-lg font-semibold text-center"
        >
          Get early access →
        </a>
        <a
          href="https://github.com/chadcoco1444/LumeSpec"
          target="_blank"
          rel="noopener noreferrer"
          className="border border-white hover:bg-white hover:text-black transition px-8 py-4 rounded-lg font-semibold text-center"
        >
          ⭐ Star on GitHub
        </a>
      </div>
    </section>
  );
}
