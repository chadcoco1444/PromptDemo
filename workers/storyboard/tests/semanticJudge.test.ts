import { describe, it, expect } from 'vitest';
import { semanticJudge } from '../src/validation/semanticJudge.js';
import type { ClaudeClient, ClaudeCompleteResult } from '../src/claude/claudeClient.js';
import type { ExtractiveViolation } from '../src/validation/extractiveCheck.js';

function fakeClaude(responses: Array<string | { kind: 'error'; message: string }>): ClaudeClient {
  let call = 0;
  return {
    async complete(): Promise<ClaudeCompleteResult> {
      const r = responses[call++];
      if (typeof r === 'string') {
        return { kind: 'ok', text: r, usage: { input_tokens: 10, output_tokens: 5 } };
      }
      if (r) return r;
      return { kind: 'error', message: 'no more responses queued' };
    },
  };
}

describe('semanticJudge', () => {
  it('approves a faithful paraphrase (Claude judges PARAPHRASE)', async () => {
    const violations: ExtractiveViolation[] = [
      { sceneId: 3, field: 'text', text: 'businesses processed $1.4T in 2025' },
    ];
    const sourceTexts = ['$1.4 trillion+ payment volume', 'in 2025', 'businesses on stripe'];
    const claude = fakeClaude(['PARAPHRASE']);

    const result = await semanticJudge(violations, sourceTexts, claude);

    expect(result.approved).toHaveLength(1);
    expect(result.stillRejected).toHaveLength(0);
    expect(result.approved[0]?.text).toBe('businesses processed $1.4T in 2025');
  });

  it('keeps a fabrication rejected (Claude judges FABRICATION)', async () => {
    const violations: ExtractiveViolation[] = [
      { sceneId: 6, field: 'text', text: 'we save 10 hours per week with stripe' },
    ];
    const sourceTexts = ['payments infrastructure', 'embed in your platform'];
    const claude = fakeClaude(['FABRICATION']);

    const result = await semanticJudge(violations, sourceTexts, claude);

    expect(result.approved).toHaveLength(0);
    expect(result.stillRejected).toHaveLength(1);
    expect(result.stillRejected[0]?.text).toBe('we save 10 hours per week with stripe');
  });

  it('treats Claude API error as REJECTED (safe default — never accidentally approve)', async () => {
    const violations: ExtractiveViolation[] = [
      { sceneId: 1, field: 'text', text: 'some risky paraphrase' },
    ];
    const sourceTexts = ['some real source'];
    const claude = fakeClaude([{ kind: 'error', message: 'rate limit exceeded' }]);

    const result = await semanticJudge(violations, sourceTexts, claude);

    expect(result.approved).toHaveLength(0);
    expect(result.stillRejected).toHaveLength(1);
  });

  it('handles mixed batch — some paraphrases, some fabrications', async () => {
    const violations: ExtractiveViolation[] = [
      { sceneId: 1, field: 'text', text: 'paraphrase one' },
      { sceneId: 2, field: 'text', text: 'fabrication two' },
      { sceneId: 3, field: 'text', text: 'paraphrase three' },
    ];
    const sourceTexts = ['source content here'];
    const claude = fakeClaude(['PARAPHRASE', 'FABRICATION', 'PARAPHRASE']);

    const result = await semanticJudge(violations, sourceTexts, claude);

    expect(result.approved.map((v) => v.sceneId)).toEqual([1, 3]);
    expect(result.stillRejected.map((v) => v.sceneId)).toEqual([2]);
  });

  it('returns empty result when no violations passed in (no API calls made)', async () => {
    let calls = 0;
    const claude: ClaudeClient = {
      async complete() {
        calls++;
        return { kind: 'ok', text: 'PARAPHRASE', usage: { input_tokens: 0, output_tokens: 0 } };
      },
    };

    const result = await semanticJudge([], ['source'], claude);

    expect(result.approved).toHaveLength(0);
    expect(result.stillRejected).toHaveLength(0);
    expect(calls).toBe(0);
  });

  it('parses tolerant of whitespace / case in Claude response', async () => {
    const violations: ExtractiveViolation[] = [
      { sceneId: 1, field: 'text', text: 'a' },
      { sceneId: 2, field: 'text', text: 'b' },
    ];
    const claude = fakeClaude(['  paraphrase  \n', 'fabrication.']);

    const result = await semanticJudge(violations, ['source'], claude);

    expect(result.approved.map((v) => v.sceneId)).toEqual([1]);
    expect(result.stillRejected.map((v) => v.sceneId)).toEqual([2]);
  });
});
