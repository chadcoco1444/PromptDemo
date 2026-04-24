import type Anthropic from '@anthropic-ai/sdk';
import type { Message } from '@anthropic-ai/sdk/resources/messages';

export type ClaudeCompleteResult =
  | { kind: 'ok'; text: string }
  | { kind: 'error'; message: string };

export interface ClaudeClient {
  complete(args: { systemPrompt: string; userMessage: string }): Promise<ClaudeCompleteResult>;
}

export interface CreateClaudeClientInput {
  sdk: Pick<Anthropic, 'messages'>;
  model: string;
  maxTokens: number;
}

export function createClaudeClient(cfg: CreateClaudeClientInput): ClaudeClient {
  return {
    async complete({ systemPrompt, userMessage }) {
      try {
        // Note: cache_control on system blocks requires the prompt-caching beta in
        // @anthropic-ai/sdk 0.30.1, but is accepted by the API. Cast the create
        // arg to satisfy the SDK's older TextBlockParam type.
        const createArgs = {
          model: cfg.model,
          max_tokens: cfg.maxTokens,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: userMessage }],
        };
        const res = (await cfg.sdk.messages.create(
          createArgs as unknown as Parameters<typeof cfg.sdk.messages.create>[0]
        )) as Message;
        if (res.stop_reason !== 'end_turn') {
          return { kind: 'error', message: `unexpected stop_reason: ${res.stop_reason}` };
        }
        const textBlock = res.content.find((b) => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
          return { kind: 'error', message: 'no text block in response' };
        }
        return { kind: 'ok', text: textBlock.text };
      } catch (err) {
        return { kind: 'error', message: (err as Error).message };
      }
    },
  };
}
