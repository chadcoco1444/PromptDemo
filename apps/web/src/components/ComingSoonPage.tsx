import Link from 'next/link';

export function ComingSoonPage({ name }: { name: string }) {
  return (
    <main
      className="min-h-[calc(100vh-65px)] flex items-center justify-center px-6"
      style={{ background: '#0a0a0a' }}
    >
      <div className="text-center space-y-6 max-w-md">
        <span className="inline-block text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full ring-1 ring-violet-500/40 bg-violet-500/10 text-violet-300">
          Coming Soon
        </span>
        <h1
          className="font-extrabold tracking-tight text-transparent bg-clip-text leading-tight"
          style={{
            backgroundImage: 'linear-gradient(180deg, #fff 0%, #c4b5fd 100%)',
            fontSize: 'clamp(28px, 5vw, 48px)',
            letterSpacing: '-0.02em',
          }}
        >
          {name}
        </h1>
        <p className="text-sm text-gray-400 leading-relaxed">
          We're working on this page. Check back soon.
        </p>
        <Link
          href="/"
          className="inline-block text-sm text-brand-400 hover:text-brand-300 transition-colors"
        >
          ← Back to home
        </Link>
      </div>
    </main>
  );
}
