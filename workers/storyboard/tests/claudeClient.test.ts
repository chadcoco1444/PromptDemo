import { describe, it, expect, vi } from 'vitest';
import { createClaudeClient, type ClaudeClient } from '../src/claude/claudeClient.js';

describe('createClaudeClient', () => {
  it('calls messages.create with cached system prompt and passes through text content', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '{"hello":1}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const sdk = { messages: { create } } as unknown as Parameters<typeof createClaudeClient>[0]['sdk'];

    const client: ClaudeClient = createClaudeClient({ sdk, model: 'claude-sonnet-4-6', maxTokens: 4096 });
    const out = await client.complete({ systemPrompt: 'SYS', userMessage: 'USR' });

    expect(out).toEqual({
      kind: 'ok',
      text: '{"hello":1}',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0]![0];
    expect(args.model).toBe('claude-sonnet-4-6');
    expect(args.max_tokens).toBe(4096);
    // system with cache_control block
    expect(args.system).toEqual([
      { type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } },
    ]);
    expect(args.messages).toEqual([{ role: 'user', content: 'USR' }]);
  });

  it('reports stop_reason other than end_turn as error', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: '' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 100, output_tokens: 50 },
    });
    const sdk = { messages: { create } } as unknown as Parameters<typeof createClaudeClient>[0]['sdk'];
    const client = createClaudeClient({ sdk, model: 'claude-sonnet-4-6', maxTokens: 4096 });
    const out = await client.complete({ systemPrompt: 'x', userMessage: 'y' });
    expect(out.kind).toBe('error');
  });

  it('surfaces SDK errors', async () => {
    const create = vi.fn().mockRejectedValue(new Error('429 rate limited'));
    const sdk = { messages: { create } } as unknown as Parameters<typeof createClaudeClient>[0]['sdk'];
    const client = createClaudeClient({ sdk, model: 'claude-sonnet-4-6', maxTokens: 4096 });
    const out = await client.complete({ systemPrompt: 'x', userMessage: 'y' });
    expect(out).toEqual({ kind: 'error', message: '429 rate limited' });
  });
});
