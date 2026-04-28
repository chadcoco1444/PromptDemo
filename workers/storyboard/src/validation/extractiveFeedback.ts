import Fuse from 'fuse.js';
import { normalizeText } from '@lumespec/schema';
import type { ExtractiveViolation } from './extractiveCheck.js';

/**
 * Format extractive-check violations into actionable feedback for Claude
 * to retry. Replaces the old flat-list format which gave Claude only
 * "rejected phrases" without resolution guidance — that left Claude
 * blindly re-paraphrasing into new failures.
 *
 * New format gives Claude:
 *   - 3 explicit resolution paths: (a) replace verbatim, (b) change scene
 *     type, (c) remove scene
 *   - Per-violation top-K closest sourceText candidates (Fuse-ranked)
 *   - A ★ verbatim suggestion when best candidate is a strong match
 *   - Optional accumulated history of prior rejected attempts (so Claude
 *     doesn't repeat the same fabrication across MAX_ATTEMPTS retries)
 *
 * Regression source: 2026-04-28 stripe.com job 2Pyf__xPHzOq6HAoxYzdA
 * exhausted MAX_ATTEMPTS=3 with the same Pattern-4 (marketing synthesis)
 * fabrications because the old feedback gave no resolution guidance.
 */

const TOP_K_CANDIDATES = 3;
// Fuse score threshold below which we promote the best candidate to a
// ★ verbatim suggestion. 0 = perfect match, 1 = no match. 0.4 keeps
// suggestion noise low — only suggest when we're confident.
const STRONG_MATCH_SCORE = 0.4;
// E1: ratio above which rejected text is "much longer" than the longest
// candidate — implies Claude is synthesizing content not present in source
// (Stripe testimonial-fabrication regression 2026-04-28). Verbatim
// substitution can't fix this; we must steer Claude to options (b)/(c).
const LENGTH_DISPARITY_RATIO = 2;

interface Candidate {
  item: string;
  score: number; // 0 = perfect, 1 = no match
}

function rankCandidates(violation: string, pool: string[]): Candidate[] {
  // threshold: 1.0 disables Fuse's default 0.6 cutoff so top-K is always
  // returned regardless of fuzzy distance.
  const fuse = new Fuse(pool, { includeScore: true, ignoreLocation: true, threshold: 1.0 });
  const fuseHits: Candidate[] = fuse
    .search(violation)
    .slice(0, TOP_K_CANDIDATES * 2)
    .map((m) => ({ item: m.item, score: m.score ?? 1 }));

  // Substring matches get score 0 (treated as best). Either direction —
  // pool entry inside violation, OR violation inside pool entry — both
  // signal "this is the source phrase Claude was trying to express".
  const substringHits: Candidate[] = pool
    .filter((p) => violation.includes(p) || p.includes(violation))
    .map((p) => ({ item: p, score: 0 }));

  const seen = new Set<string>();
  const combined: Candidate[] = [];
  for (const c of [...substringHits, ...fuseHits]) {
    if (seen.has(c.item)) continue;
    seen.add(c.item);
    combined.push(c);
  }
  return combined.slice(0, TOP_K_CANDIDATES);
}

export function formatExtractiveFeedback(
  violations: ExtractiveViolation[],
  sourceTexts: string[],
  previousFeedback?: string,
): string {
  const pool = sourceTexts.map(normalizeText);

  const lines: string[] = [
    'Extractive check rejected text fields. These phrases are NOT substrings of sourceTexts and would mislead viewers if rendered.',
    '',
    'Resolution strategy — pick ONE for each rejected field:',
    '  (a) Replace with a VERBATIM substring of sourceTexts (closest candidates listed below)',
    '  (b) Change the scene type — if no sourceText fits, the scene is wrong for this source',
    '  (c) Remove the scene entirely — a 7-scene storyboard ships better than rejection',
    '',
    'Rejected fields:',
    '',
  ];

  for (const v of violations) {
    lines.push(`scene ${v.sceneId}: "${v.text}"`);
    const candidates = rankCandidates(normalizeText(v.text), pool);
    if (candidates.length === 0) {
      lines.push('  no close sourceText match — strongly consider option (b) change scene type, or (c) remove scene');
    } else {
      lines.push('  closest sourceTexts:');
      for (const c of candidates) {
        lines.push(`    - "${c.item}"`);
      }
      // E1: detect length disparity — if Claude's rejection is much longer
      // than any candidate, no verbatim substitution can satisfy the scene
      // structure. Push hard toward (b) change scene type / (c) remove scene
      // before suggesting a too-short candidate that won't fit.
      const longestCandidate = Math.max(...candidates.map((c) => c.item.length));
      if (v.text.length > longestCandidate * LENGTH_DISPARITY_RATIO) {
        lines.push(
          `  ⚠ length disparity: your phrase is ${v.text.length} chars but longest candidate is only ${longestCandidate} chars — verbatim substitution likely won't fit. Strongly recommend option (b) change scene type or (c) remove scene.`,
        );
      }
      const best = candidates[0];
      if (best && best.score < STRONG_MATCH_SCORE) {
        lines.push(`  ★ suggestion: use "${best.item}" verbatim`);
      }
    }
    lines.push('');
  }

  let result = lines.join('\n');
  if (previousFeedback) {
    result += '\n\n## Previous rejected attempts (do NOT repeat these errors):\n' + previousFeedback;
  }
  return result;
}
