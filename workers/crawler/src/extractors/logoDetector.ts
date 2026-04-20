export type LogoSource = 'img-alt' | 'header-img' | 'favicon' | 'body';

export interface LogoCandidate {
  src: string;
  alt: string;
  widthPx: number;
  source: LogoSource;
}

const PRIORITY: Record<LogoSource, number> = {
  'img-alt': 100,
  'header-img': 60,
  favicon: 30,
  body: 0,
};

export function pickLogoCandidate(candidates: LogoCandidate[]): LogoCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const diff = PRIORITY[b.source] - PRIORITY[a.source];
    if (diff !== 0) return diff;
    return b.widthPx - a.widthPx;
  });
  return sorted[0] ?? null;
}
