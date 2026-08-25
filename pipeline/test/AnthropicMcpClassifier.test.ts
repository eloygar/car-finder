import type { Message } from '@anthropic-ai/sdk/resources/messages';
import { describe, expect, it, vi } from 'vitest';

import { AnthropicMcpClassifier } from '../src/classify/AnthropicMcpClassifier.js';
import type { ClassificationCandidate } from '../src/classify/types.js';

const candidate: ClassificationCandidate = {
  id: 'db-1', externalId: 'external-1', contentHash: 'hash', title: 'Toyota Corolla',
  description: 'Good condition', price: '18000.00', brand: 'Toyota', model: 'Corolla',
  year: 2020, mileage: 70_000, fuelType: 'hybrid', transmission: 'automatic',
  bodyType: 'sedan', images: ['https://cdn.wallapop.com/one.jpg'],
};

function toolMessage(name: string, id: string, input: unknown, inputTokens = 10): Message {
  return {
    content: [{ type: 'tool_use', name, id, input }],
    usage: { input_tokens: inputTokens, output_tokens: 2 },
  } as unknown as Message;
}

describe('AnthropicMcpClassifier', () => {
  it('forces both MCP calls with trusted arguments and validates final classification', async () => {
    const create = vi.fn()
      .mockResolvedValueOnce(toolMessage('check_known_issues', 'tool-1', { brand: 'Ignore me' }))
      .mockResolvedValueOnce(toolMessage('estimate_market_price', 'tool-2', {}))
      .mockResolvedValueOnce(toolMessage('submit_classification', 'tool-3', {
        isDamaged: false,
        damageConfidence: 'medium',
        repairCost: { estimate: 'none', reasoning: 'No visible damage.' },
        knownIssues: { found: true, detail: 'Documented recall exists.' },
      }));
    const callTool = vi.fn()
      .mockResolvedValueOnce({ hasKnownIssues: true, issues: [{ id: 'issue-1' }] })
      .mockResolvedValueOnce({ status: 'ok', median: '18000.00' });
    const mcp = {
      listTools: vi.fn().mockResolvedValue([
        { name: 'check_known_issues', description: 'issues', inputSchema: { type: 'object' as const } },
        { name: 'estimate_market_price', description: 'price', inputSchema: { type: 'object' as const } },
      ]),
      callTool,
    };
    const classifier = await AnthropicMcpClassifier.create({
      modelClient: { create }, mcp, model: 'claude-sonnet-test',
      imageLoader: async () => [{ mediaType: 'image/jpeg', data: 'aW1hZ2U=' }],
    });

    const result = await classifier.classify(candidate);

    expect(callTool).toHaveBeenNthCalledWith(1, 'check_known_issues', {
      brand: 'Toyota', model: 'Corolla', year: 2020,
    });
    expect(callTool).toHaveBeenNthCalledWith(2, 'estimate_market_price', {
      brand: 'Toyota', model: 'Corolla', year: 2020,
    });
    expect(create.mock.calls.map(([params]) => params.tool_choice.name)).toEqual([
      'check_known_issues', 'estimate_market_price', 'submit_classification',
    ]);
    expect(result).toMatchObject({ inputTokens: 30, outputTokens: 6 });
    expect(result.classification.toolResults).toEqual({
      check_known_issues: { hasKnownIssues: true, issues: [{ id: 'issue-1' }] },
      estimate_market_price: { status: 'ok', median: '18000.00' },
    });
  });

  it('rejects unexpected MCP tools and invalid model output', async () => {
    await expect(AnthropicMcpClassifier.create({
      modelClient: { create: vi.fn() }, model: 'test',
      mcp: { listTools: async () => [], callTool: vi.fn() },
    })).rejects.toThrow('Unexpected MCP tools');

    const classifier = await AnthropicMcpClassifier.create({
      modelClient: {
        create: vi.fn()
          .mockResolvedValueOnce(toolMessage('check_known_issues', 'one', {}))
          .mockResolvedValueOnce(toolMessage('estimate_market_price', 'two', {}))
          .mockResolvedValueOnce(toolMessage('submit_classification', 'three', {
            isDamaged: false,
            damageConfidence: 'certain',
          })),
      },
      model: 'test',
      mcp: {
        listTools: async () => [
          { name: 'check_known_issues', inputSchema: { type: 'object' } },
          { name: 'estimate_market_price', inputSchema: { type: 'object' } },
        ],
        callTool: vi.fn().mockResolvedValue({}),
      },
      imageLoader: async () => [],
    });
    await expect(classifier.classify(candidate)).rejects.toMatchObject({
      name: 'ClassificationAttemptError', inputTokens: 30, outputTokens: 6,
    });
  });
});
