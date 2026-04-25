import Link from 'next/link';

const PRODUCT = [
  { label: 'Pricing', href: '/billing' },
  { label: 'Roadmap', href: '/' },
  { label: 'Status', href: '/' },
];
const BUILD = [
  { label: 'Source', href: 'https://github.com/chadcoco1444/PromptDemo' },
  { label: 'Architecture', href: '/' },
  { label: 'Design decisions', href: '/' },
];
const LEGAL = [
  { label: 'Privacy', href: '/' },
  { label: 'Terms', href: '/' },
  { label: 'Contact', href: 'mailto:hi@promptdemo.dev' },
];

function LinkCluster({ heading, links }: { heading: string; links: typeof PRODUCT }) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{heading}</h4>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link
              href={l.href}
              className="text-sm text-gray-400 hover:text-brand-300 transition-colors"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-[#0a0a14] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          <LinkCluster heading="Product" links={PRODUCT} />
          <LinkCluster heading="Build" links={BUILD} />
          <LinkCluster heading="Legal" links={LEGAL} />
        </div>
        <div className="mt-16 pt-6 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-xs text-gray-500">
          <div>
            <span className="font-semibold text-gray-300">PromptDemo</span>
            <span className="ml-3 italic">Made with PromptDemo. Of course.</span>
          </div>
          <div>© 2026 PromptDemo · v2.1</div>
        </div>
      </div>
    </footer>
  );
}
