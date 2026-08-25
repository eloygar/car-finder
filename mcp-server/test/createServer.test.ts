import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMcpServer } from '../src/createServer.js';
import type { McpToolRepository } from '../src/tools/types.js';

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

async function connectedClient(repository: McpToolRepository) {
  const logger = { error: vi.fn() };
  const server = createMcpServer({ repository, logger });
  const client = new Client({ name: 'unit-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closeCallbacks.push(async () => {
    await client.close();
    await server.close();
  });
  return { client, logger };
}

describe('createMcpServer', () => {
  it('advertises exactly the two read-only tools and returns structured content', async () => {
    const repository: McpToolRepository = {
      findKnownIssues: vi.fn().mockResolvedValue([]),
      findComparablePrices: vi.fn().mockResolvedValue(['1.00', '2.00', '3.00']),
    };
    const { client } = await connectedClient(repository);

    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name).sort()).toEqual([
      'check_known_issues',
      'estimate_market_price',
    ]);
    expect(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);

    const result = await client.callTool({
      name: 'check_known_issues',
      arguments: { brand: 'Toyota', model: 'Corolla' },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({ hasKnownIssues: false, issues: [] });
    expect(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')).toEqual(
      result.structuredContent,
    );

    const market = await client.callTool({
      name: 'estimate_market_price',
      arguments: { brand: 'Toyota', model: 'Corolla' },
    });
    expect(market.isError).not.toBe(true);
    expect(market.structuredContent).toMatchObject({
      status: 'ok',
      currency: 'EUR',
      sampleSize: 3,
      average: '2.00',
      median: '2.00',
    });
  });

  it('rejects malformed arguments at the protocol boundary', async () => {
    const repository: McpToolRepository = {
      findKnownIssues: vi.fn().mockResolvedValue([]),
      findComparablePrices: vi.fn().mockResolvedValue([]),
    };
    const { client } = await connectedClient(repository);

    const result = await client.callTool({
      name: 'check_known_issues',
      arguments: { brand: '', model: 'Corolla', year: 2020.5 },
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(repository.findKnownIssues).not.toHaveBeenCalled();
  });

  it('converts repository failures to safe tool errors and keeps serving', async () => {
    const repository: McpToolRepository = {
      findKnownIssues: vi.fn()
        .mockRejectedValueOnce(new Error('postgresql://user:secret@example.invalid/database'))
        .mockResolvedValueOnce([]),
      findComparablePrices: vi.fn().mockResolvedValue([]),
    };
    const { client, logger } = await connectedClient(repository);

    const failed = await client.callTool({
      name: 'check_known_issues',
      arguments: { brand: 'Toyota', model: 'Corolla' },
    });
    expect(failed.isError).toBe(true);
    expect(JSON.stringify(failed)).not.toContain('secret');
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('secret');

    const recovered = await client.callTool({
      name: 'check_known_issues',
      arguments: { brand: 'Toyota', model: 'Corolla' },
    });
    expect(recovered.isError).not.toBe(true);
  });
});
