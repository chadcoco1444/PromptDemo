import Fuse from 'fuse.js';
import { normalizeText, type Scene, type Storyboard } from '@promptdemo/schema';

const FUSE_THRESHOLD = 0.3;
const CJK_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

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

export function extractiveCheck(sb: Storyboard): ExtractiveResult {
  const pool = sb.assets.sourceTexts.map(normalizeText);
  const fuse = new Fuse(pool, { threshold: FUSE_THRESHOLD, includeScore: true });
  const cjkPoolJoined = pool.join(' | ');

  const violations: ExtractiveViolation[] = [];

  for (const scene of sb.scenes) {
    for (const raw of collectSceneTexts(scene)) {
      const n = normalizeText(raw);
      if (!n) continue;

      let matched: boolean;
      if (isCjk(n)) {
        // CJK: substring match within the concatenated pool
        matched = cjkPoolJoined.includes(n);
        if (!matched) {
          // weaker: any 3-gram of n appears in pool (minimum meaningful chunk)
          if (n.length >= 3) {
            for (let i = 0; i <= n.length - 3; i++) {
              const gram = n.slice(i, i + 3);
              if (cjkPoolJoined.includes(gram)) {
                matched = true;
                break;
              }
            }
          }
        }
      } else {
        const best = fuse.search(n)[0];
        matched = !!best && best.score !== undefined && best.score <= FUSE_THRESHOLD;
      }

      if (!matched) {
        violations.push({ sceneId: scene.sceneId, field: 'text', text: raw });
      }
    }
  }

  return violations.length === 0 ? { kind: 'ok' } : { kind: 'error', violations };
}
