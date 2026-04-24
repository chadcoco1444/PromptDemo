type Stage = 'crawl' | 'storyboard' | 'render' | null;

const LABEL: Record<Exclude<Stage, null>, string> = {
  crawl: 'Crawling your site…',
  storyboard: 'Writing the storyboard…',
  render: 'Rendering video…',
};

export function StageLabel({ stage }: { stage: Stage }) {
  if (stage === null) return <span className="text-slate-500">Starting…</span>;
  return <span className="text-slate-800">{LABEL[stage]}</span>;
}
