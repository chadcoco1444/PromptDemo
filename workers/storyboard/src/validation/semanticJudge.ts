import type { ClaudeClient } from '../claude/claudeClient.js';
import type { ExtractiveViolation } from './extractiveCheck.js';

/**
 * E3 — semantic appeal court for extractive-check violations.
 *
 * After strict extractive (substring + Fuse + joinedPool) rejects a
 * scene-text field, this judge asks Claude (cheap Haiku) whether the
 * rejection is a faithful PARAPHRASE of source content (factual claims
 * preserved, only word choice differs) or an actual FABRICATION (new
 * claims, numbers, names, capabilities).
 *
 * Approved violations re-enter the success path (storyboard ships with
 * the paraphrased text). Rejected violations stay in the failure
 * pipeline and feed back to Claude for retry — same shape as before.
 *
 * Safety contract:
 *   - API failure → treat as REJECTED (NEVER accidentally approve)
 *   - Unrecognizable response → REJECTED
 *   - Empty input → no API calls made
 *
 * Cost: 1 Haiku call per violation; ~$0.0001-0.0005 each. Adds 1-3s
 * latency per failed extractive cycle. Net: when paraphrase rate is
 * high (synthesis-heavy sites like Stripe), saves an entire MAX_ATTEMPTS
 * retry cycle (~$0.30) at the cost of N small calls (~$0.001).
 */

export interface SemanticJudgeResult {
  approved: ExtractiveViolation[];
  stillRejected: ExtractiveViolation[];
}

const SYSTEM_PROMPT = `You are a strict content validator for AI-generated marketing video scenes. Your only job: classify a single short text as PARAPHRASE or FABRICATION relative to a source content pool.

A FAITHFUL PARAPHRASE preserves all factual claims (numbers, names, product capabilities, quotes) — only word choice differs. Combining two source phrases into one is fine if no new claim is introduced.

A FABRICATION introduces claims, numbers, names, or capabilities NOT explicitly in source.

Examples:
  Source: "$1.4 trillion+ payment volume" + "in 2025"
  Generated: "businesses processed $1.4T in 2025"
  Verdict: PARAPHRASE (preserves both facts)

  Source: "150k+ users on stripe"
  Generated: "millions of users trust stripe"
  Verdict: FABRICATION (changes the number)

  Source: "linear partners with stripe"
  Generated: "linear says stripe transformed our business"
  Verdict: FABRICATION (invented testimonial quote)

  Source: "embedded payments" + "expand offerings"
  Generated: "expand your product offerings with embedded payments"
  Verdict: PARAPHRASE (combines two phrases, no new claim)

Respond with EXACTLY one word: PARAPHRASE or FABRICATION. No explanation.`;

function buildUserMessage(violation: ExtractiveViolation, sourceTexts: string[]): string {
  return [
    'Source content (one entry per line):',
    sourceTexts.map((t) => `- ${t}`).join('\n'),
    '',
    'Generated text to classify:',
    `"${violation.text}"`,
    '',
    'Verdict:',
  ].join('\n');
}

function parseVerdict(text: string): 'PARAPHRASE' | 'FABRICATION' | 'UNKNOWN' {
  const normalized = text.trim().toUpperCase();
  if (normalized.startsWith('PARAPHRASE')) return 'PARAPHRASE';
  if (normalized.startsWith('FABRICATION')) return 'FABRICATION';
  return 'UNKNOWN';
}

export async function semanticJudge(
  violations: ExtractiveViolation[],
  sourceTexts: string[],
  claude: ClaudeClient,
): Promise<SemanticJudgeResult> {
  const approved: ExtractiveViolation[] = [];
  const stillRejected: ExtractiveViolation[] = [];

  for (const v of violations) {
    const resp = await claude.complete({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: buildUserMessage(v, sourceTexts),
    });
    if (resp.kind === 'error') {
      // Safety default — never silently approve when judge is unavailable.
      stillRejected.push(v);
      continue;
    }
    const verdict = parseVerdict(resp.text);
    if (verdict === 'PARAPHRASE') {
      approved.push(v);
    } else {
      // FABRICATION or UNKNOWN — stay rejected
      stillRejected.push(v);
    }
  }

  return { approved, stillRejected };
}
