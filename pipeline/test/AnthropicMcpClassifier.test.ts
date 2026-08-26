import type { Message, Tool } from '@anthropic-ai/sdk/resources/messages';
import { describe, expect, it, vi } from 'vitest';

import { AnthropicMcpClassifier } from '../src/classify/AnthropicMcpClassifier.js';
import type { ClassificationCandidate } from '../src/classify/types.js';

const candidate: ClassificationCandidate = {
  id: 'db-1', externalId: 'external-1', contentHash: 'hash', title: 'Toyota Corolla',
  description: 'Funciona perfectamente y se usa a diario.', price: '18000.00', brand: 'Toyota', model: 'Corolla',
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
  it('forces only the operability MCP tool with the trusted description', async () => {
    const proposed = {
      status: 'operational',
      confidence: 'high',
      evidence: ['Funciona perfectamente'],
      reason: 'The seller explicitly says it works.',
    };
    const create = vi.fn().mockResolvedValueOnce(
      toolMessage('classify_vehicle_operability', 'tool-1', proposed),
    );
    const callTool = vi.fn().mockResolvedValueOnce(proposed);
    const mcp = {
      listTools: vi.fn().mockResolvedValue([
        {
          name: 'classify_vehicle_operability',
          description: 'operability',
          inputSchema: {
            type: 'object' as const,
            properties: { description: { type: 'string' }, status: { type: 'string' } },
            required: ['description', 'status'],
          },
        },
        { name: 'check_known_issues', description: 'issues', inputSchema: { type: 'object' as const } },
        { name: 'estimate_market_price', description: 'price', inputSchema: { type: 'object' as const } },
      ]),
      callTool,
    };
    const classifier = await AnthropicMcpClassifier.create({
      modelClient: { create }, mcp, model: 'claude-sonnet-test',
    });

    const result = await classifier.classify(candidate);

    expect(callTool).toHaveBeenCalledWith('classify_vehicle_operability', {
      ...proposed,
      description: candidate.description,
    });
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0].tool_choice).toMatchObject({
      name: 'classify_vehicle_operability',
    });
    expect(create.mock.calls[0]?.[0].tools?.map((tool: Tool) => tool.name)).toEqual([
      'classify_vehicle_operability',
    ]);
    expect(create.mock.calls[0]?.[0].tools?.[0]?.input_schema.properties)
      .not.toHaveProperty('description');
    expect(result).toMatchObject({ classification: proposed, inputTokens: 10, outputTokens: 2 });
  });

  it('rejects a missing operability tool and invalid MCP output', async () => {
    await expect(AnthropicMcpClassifier.create({
      modelClient: { create: vi.fn() }, model: 'test',
      mcp: { listTools: async () => [], callTool: vi.fn() },
    })).rejects.toThrow('Missing required MCP tool');

    const classifier = await AnthropicMcpClassifier.create({
      modelClient: {
        create: vi.fn()
          .mockResolvedValueOnce(toolMessage('classify_vehicle_operability', 'one', {
            status: 'operational', confidence: 'high', evidence: [], reason: 'Works.',
          })),
      },
      model: 'test',
      mcp: {
        listTools: async () => [
          { name: 'classify_vehicle_operability', inputSchema: { type: 'object' } },
        ],
        callTool: vi.fn().mockResolvedValue({ status: 'invalid' }),
      },
    });
    await expect(classifier.classify(candidate)).rejects.toMatchObject({
      name: 'ClassificationAttemptError', inputTokens: 10, outputTokens: 2,
    });
  });
});
