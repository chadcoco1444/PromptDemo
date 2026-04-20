export function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

const NEUTRAL_LUMINANCE_HI = 0.92;
const NEUTRAL_LUMINANCE_LO = 0.08;

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isNeutral(hex: string): boolean {
  const lum = luminance(hex);
  return lum >= NEUTRAL_LUMINANCE_HI || lum <= NEUTRAL_LUMINANCE_LO;
}

export interface DominantColors {
  primary?: string;
  secondary?: string;
}

export function pickDominantFromFrequencies(counts: Map<string, number>): DominantColors {
  const ranked = [...counts.entries()]
    .filter(([hex]) => /^#[0-9a-f]{6}$/i.test(hex) && !isNeutral(hex))
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);
  const out: DominantColors = {};
  if (ranked[0]) out.primary = ranked[0];
  if (ranked[1]) out.secondary = ranked[1];
  return out;
}
