import Fuse from 'fuse.js';
import { normalizeText, type Scene, type Storyboard } from '@promptdemo/schema';

const FUSE_THRESHOLD = 0.3;
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;
// List-separator characters Claude uses to join extracted source phrases
// (common in feature lists / badge rows). Splitting on these lets the
// extractive check pass a concatenated phrase when every segment is
// independently in the whitelist. Comma is intentionally omitted — too
// common within natural phrases. Slash/dash only split when space-padded,
// which is the unambiguous "list separator" shape ("A / B / C"), preserving
// inline uses like "AI/ML" or "multi-tenant".
const SEGMENT_SEPARATORS = /\s*[·•|]\s*|\s+\/\s+|\s+[—\-]\s+/;
const MIN_SEGMENT_LEN = 3;

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

export function extractiveCheck(sb: Storyboard): ExtractiveResult {
  const pool = sb.assets.sourceTexts.map(normalizeText);
  const fuse = new Fuse(pool, { threshold: FUSE_THRESHOLD, includeScore: true });
  const cjkPoolJoined = pool.join(' | ');

  const violations: ExtractiveViolation[] = [];

  for (const scene of sb.scenes) {
    for (const raw of collectSceneTexts(scene)) {
      const n = normalizeText(raw);
      if (!n) continue;

      // First pass: does the whole phrase match? (Exact behavior prior to
      // segment fallback — unchanged for single-phrase inputs.)
      let matched = phraseMatches(n, pool, cjkPoolJoined, fuse);

      // Second pass: if the whole string looks like a concatenation of source
      // phrases ("A · B · C" or "A | B | C"), split on the list separators
      // and accept only if EVERY non-trivial segment is independently in the
      // whitelist. Preserves the "no invented claims" guarantee while letting
      // Claude rejoin extracted terms with punctuation — a natural style for
      // visual feature-row displays.
      if (!matched && SEGMENT_SEPARATORS.test(n)) {
        const segments = n
          .split(SEGMENT_SEPARATORS)
          .map((s) => normalizeText(s))
          .filter((s) => s.length >= MIN_SEGMENT_LEN);
        if (segments.length >= 2) {
          matched = segments.every((seg) =>
            phraseMatches(seg, pool, cjkPoolJoined, fuse)
          );
        }
      }

      if (!matched) {
        violations.push({ sceneId: scene.sceneId, field: 'text', text: raw });
      }
    }
  }

  return violations.length === 0 ? { kind: 'ok' } : { kind: 'error', violations };
}
