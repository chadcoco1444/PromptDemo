import Fuse from 'fuse.js';
import { normalizeText, type Scene, type Storyboard } from '@promptdemo/schema';

const FUSE_THRESHOLD = 0.3;
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;
// List-separator characters Claude uses to join extracted source phrases.
// Two tiers:
//   Strong separators: ·, •, |, " / ", " — ", " - " — these are unambiguous
//   list structure. Space-padded slash/dash preserves inline "AI/ML" and
//   "multi-tenant" as single terms.
//   Weak separators: comma. Commas DO appear in natural prose, but Claude
//   routinely uses them to join extracted phrases when visual list separators
//   aren't available (e.g. "Senior firmware engineer specializing in A, B,
//   and C"). Comma-splitting is still safe because every segment must
//   independently match the whitelist — if Claude synthesized a novel
//   sentence, the segment fuse-search will reject it.
const STRONG_SEPARATORS = /\s*[·•|]\s*|\s+\/\s+|\s+[—\-]\s+/;
const COMMA_SEPARATOR = /\s*,\s*/;
const MIN_SEGMENT_LEN = 3;
// Leading conjunctions Claude tacks onto the tail of a comma list
// ("A, B, and C"). Trim them before fuzzy-match so "and 3gpp protocols"
// matches "3gpp protocols" in the pool.
const LEADING_CONJUNCTION_RE = /^(and|or|&)\s+/i;
// Trailing punctuation that fuse scores against verbatim if we don't strip.
const TRAILING_PUNCT_RE = /[.!?,;:]+$/;

export function collectSceneTexts(scene: Scene): string[] {
  switch (scene.type) {
    case 'HeroRealShot':
    case 'HeroStylized':
      return [scene.props.title, ...(scene.props.subtitle ? [scene.props.subtitle] : [])];
    case 'FeatureCallout':
      return [scene.props.title, scene.props.description];
    case 'CursorDemo':
      return [scene.props.targetDescription];
    case 'SmoothScroll':
      return [];
    case 'UseCaseStory':
      return scene.props.beats.map((b) => b.text);
    case 'StatsBand':
      return scene.props.stats.flatMap((s) => [s.value, s.label]);
    case 'BentoGrid':
      return scene.props.items.flatMap((i) => [i.title, ...(i.description ? [i.description] : [])]);
    case 'TextPunch':
      return [scene.props.text];
    case 'CTA':
      return [scene.props.headline];
  }
}

export type ExtractiveViolation = {
  sceneId: number;
  field: string;
  text: string;
};

export type ExtractiveResult =
  | { kind: 'ok' }
  | { kind: 'error'; violations: ExtractiveViolation[] };

function isCjk(s: string): boolean {
  return CJK_RE.test(s);
}

/**
 * Check whether a single (already-normalized) phrase matches the whitelist.
 * Used both for the full phrase and for each segment when we split.
 */
function phraseMatches(
  n: string,
  pool: string[],
  cjkPoolJoined: string,
  fuse: Fuse<string>
): boolean {
  if (!n) return true;
  if (isCjk(n)) {
    if (cjkPoolJoined.includes(n)) return true;
    if (n.length >= 3) {
      for (let i = 0; i <= n.length - 3; i++) {
        if (cjkPoolJoined.includes(n.slice(i, i + 3))) return true;
      }
    }
    return false;
  }
  const best = fuse.search(n)[0];
  return !!best && best.score !== undefined && best.score <= FUSE_THRESHOLD;
}

function normalizeSegment(raw: string): string {
  return normalizeText(
    raw
      .replace(LEADING_CONJUNCTION_RE, '')
      .replace(TRAILING_PUNCT_RE, '')
  );
}

/**
 * Try to match `n` by splitting on `separator`. Returns true iff at least
 * 2 non-trivial segments are produced AND every segment independently matches
 * the whitelist.
 */
function allSegmentsMatch(
  n: string,
  separator: RegExp,
  pool: string[],
  cjkPoolJoined: string,
  fuse: Fuse<string>
): boolean {
  const segments = n
    .split(separator)
    .map(normalizeSegment)
    .filter((s) => s.length >= MIN_SEGMENT_LEN);
  if (segments.length < 2) return false;
  return segments.every((seg) => phraseMatches(seg, pool, cjkPoolJoined, fuse));
}

export function extractiveCheck(sb: Storyboard): ExtractiveResult {
  const pool = sb.assets.sourceTexts.map(normalizeText);
  const fuse = new Fuse(pool, { threshold: FUSE_THRESHOLD, includeScore: true });
  const cjkPoolJoined = pool.join(' | ');

  const violations: ExtractiveViolation[] = [];

  for (const scene of sb.scenes) {
    for (const raw of collectSceneTexts(scene)) {
      const n = normalizeText(raw);
      if (!n) continue;

      // Pass 1: whole phrase match (preserves v1 behavior for single phrases).
      let matched = phraseMatches(n, pool, cjkPoolJoined, fuse);

      // Pass 2: strong separators (·, •, |, space-padded / or —).
      if (!matched && STRONG_SEPARATORS.test(n)) {
        matched = allSegmentsMatch(n, STRONG_SEPARATORS, pool, cjkPoolJoined, fuse);
      }

      // Pass 3: comma separators (with leading-conjunction + trailing-punct
      // segment normalization). Comma lists are common in Claude's natural
      // prose — safe because each segment must independently match the pool.
      if (!matched && COMMA_SEPARATOR.test(n)) {
        matched = allSegmentsMatch(n, COMMA_SEPARATOR, pool, cjkPoolJoined, fuse);
      }

      if (!matched) {
        violations.push({ sceneId: scene.sceneId, field: 'text', text: raw });
      }
    }
  }

  return violations.length === 0 ? { kind: 'ok' } : { kind: 'error', violations };
}
