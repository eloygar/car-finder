import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { describe, expect, it, vi } from 'vitest';

import { AnthropicVehicleAnalysisService } from '../src/anthropic/AnthropicVehicleAnalysisService.js';

describe('AnthropicVehicleAnalysisService', () => {
  it('uses Sonnet 5 without tools and grounds operability in the description', async () => {
    const create = vi.fn().mockResolvedValue(message({
      status: 'operational', confidence: 'high',
      evidence: ['Funciona perfectamente'], reason: 'The seller says it works.',
    }));
    const service = new AnthropicVehicleAnalysisService({ create });

    const result = await service.checkOperationalStatus('Funciona perfectamente.');

    const request = create.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      model: 'claude-sonnet-5', thinking: { type: 'disabled' },
      output_config: { format: { type: 'json_schema' } },
    });
    expect(request).not.toHaveProperty('tools');
    expect(result).toMatchObject({
      operability: { status: 'operational' },
      usage: { inputTokens: 11, outputTokens: 3, webSearchRequests: 0 },
    });
  });

  it('uses Haiku 4.5 with native web_search and returns a one-paragraph summary', async () => {
    const create = vi.fn().mockResolvedValue(message({
      found: true,
      summary: 'The model has a documented recall affecting one of its control modules.',
      sources: [{ title: 'Official recall', url: 'https://example.test/recall' }],
    }, { web_search_requests: 1 }));
    const service = new AnthropicVehicleAnalysisService({ create });

    const result = await service.checkKnownIssuesWeb({ brand: 'Toyota', model: 'Corolla', year: 2023 });

    expect(create.mock.calls[0]?.[0]).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
    });
    expect(result).toMatchObject({
      knownIssues: { found: true },
      usage: { inputTokens: 11, outputTokens: 3, webSearchRequests: 1 },
    });
  });
});

function message(value: unknown, serverToolUse?: { web_search_requests: number }): Message {
  return {
    content: [{ type: 'text', text: JSON.stringify(value), citations: null }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 11,
      output_tokens: 3,
      ...(serverToolUse ? { server_tool_use: serverToolUse } : {}),
    },
  } as unknown as Message;
}
