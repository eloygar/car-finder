import { Client } from '@modelcontextprotocol/client';
import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createServerTransport } from '../../../mcp-server/src/smoke.js';
import { createPrismaClient, type DatabaseClient } from '../../src/db/client.js';
import { AnthropicMcpClassifier } from '../../src/classify/AnthropicMcpClassifier.js';
import { PrismaClassificationRepository } from '../../src/classify/PrismaClassificationRepository.js';
import { runClassification } from '../../src/classify/runClassification.js';

const externalIds = ['classify-integration-1', 'classify-integration-2', 'classify-integration-3'];
const issueId = 'classify-integration-issue';
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function message(toolName: string, input: Record<string, unknown>, sequence: number): Message {
  return {
    id: `msg-${sequence}`,
    type: 'message',
    role: 'assistant',
    model: 'fake-model',
    content: [{ type: 'tool_use', id: `tool-${sequence}`, name: toolName, input }],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  } as Message;
}

describe('classification with real PostgreSQL and MCP stdio', () => {
  let prisma: DatabaseClient;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.listing.deleteMany({ where: { externalId: { in: externalIds } } });
    await prisma.knownIssue.deleteMany({ where: { id: issueId } });
    await prisma.knownIssue.create({
      data: {
        id: issueId,
        brand: 'IntegrationBrand',
        model: 'IntegrationModel',
        yearFrom: 2019,
        yearTo: 2021,
        severity: 'medium',
        issueDescription: 'Integration-only known issue',
        source: 'https://example.com/integration-issue',
      },
    });
    for (const [index, externalId] of externalIds.entries()) {
      await prisma.listing.create({
        data: {
          externalId,
          title: `Integration car ${index + 1}`,
          description: 'Clean integration fixture',
          price: `${10_000 + index * 1_000}.00`,
          brand: 'IntegrationBrand',
          model: 'IntegrationModel',
          year: 2020,
          url: `https://wallapop.com/item/${externalId}`,
          images: [],
          contentHash: `classify-hash-${index + 1}`,
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { externalId: { in: externalIds } } });
    await prisma.knownIssue.deleteMany({ where: { id: issueId } });
    await prisma.$disconnect();
  });

  it('calls the real MCP tools, stores JSONB, and becomes idempotent', async () => {
    const repository = new PrismaClassificationRepository(prisma);
    const modelCalls: MessageCreateParamsNonStreaming[] = [];
    const fakeModel = {
      create: async (params: MessageCreateParamsNonStreaming) => {
        modelCalls.push(params);
        const choice = params.tool_choice as { type: string; name?: string } | undefined;
        const name = choice?.type === 'tool' && choice.name ? choice.name : 'unexpected';
        if (name === 'submit_classification') {
          return message(name, {
            isDamaged: false,
            damageConfidence: 'high',
            repairCost: { estimate: 'none', reasoning: 'No damage in fixture.' },
            knownIssues: { found: true, detail: 'Integration-only known issue' },
          }, modelCalls.length);
        }
        return message(name, { brand: 'ignored', model: 'ignored', year: 1900 }, modelCalls.length);
      },
    };

    const summary = await runClassification({
      run: { all: false, dryRun: false, force: false, only: externalIds[0] },
      repository,
      logger,
      createSession: async () => {
        const client = new Client({ name: 'classification-integration-test', version: '0.1.0' });
        await client.connect(createServerTransport({ stderr: 'pipe' }));
        const classifier = await AnthropicMcpClassifier.create({
          model: 'fake-model',
          modelClient: fakeModel,
          imageLoader: async () => [],
          mcp: {
            listTools: async () => {
              const result = await client.listTools();
              return result.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema as { type: 'object'; [key: string]: unknown },
              }));
            },
            callTool: async (name, args) => {
              const result = await client.callTool({ name, arguments: args });
              if (result.isError) throw new Error(`MCP tool ${name} failed`);
              return result.structuredContent ?? result.content;
            },
          },
        });
        return { classifier, close: () => client.close() };
      },
    });

    expect(summary).toMatchObject({ selected: 1, classified: 1, failed: 0, stale: 0 });
    expect(modelCalls.map((call) => call.tool_choice)).toEqual([
      expect.objectContaining({ name: 'check_known_issues' }),
      expect.objectContaining({ name: 'estimate_market_price' }),
      expect.objectContaining({ name: 'submit_classification' }),
    ]);
    const stored = await prisma.listing.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'wallapop', externalId: externalIds[0]! } },
    });
    expect(stored).toMatchObject({ classificationVersion: 'v1' });
    expect(stored.classification).toMatchObject({
      isDamaged: false,
      toolResults: {
        check_known_issues: { hasKnownIssues: true },
        estimate_market_price: { status: 'ok', sampleSize: 3 },
      },
    });

    const second = await runClassification({
      run: { all: false, dryRun: true, force: false, only: externalIds[0] },
      repository,
      logger,
    });
    expect(second.selected).toBe(0);
  });
});
