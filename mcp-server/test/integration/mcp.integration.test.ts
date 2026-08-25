import { Client } from '@modelcontextprotocol/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient, type DatabaseClient } from '../../../shared/src/db/client.js';
import { createServerTransport } from '../../src/smoke.js';

const ISSUE_ID = 'integration-mcp-known-issue';
const LISTING_IDS = [
  'integration-mcp-price-1',
  'integration-mcp-price-2',
  'integration-mcp-price-3',
  'integration-mcp-old-year',
  'integration-mcp-inactive',
  'integration-mcp-other-model',
];

describe('MCP stdio server', () => {
  let prisma: DatabaseClient;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await cleanup(prisma);
    await prisma.knownIssue.create({
      data: {
        id: ISSUE_ID,
        brand: 'Toyota',
        model: 'Corolla',
        yearFrom: 2019,
        yearTo: null,
        issueDescription: 'Integration issue',
        severity: 'medium',
        source: 'https://example.com/integration-issue',
      },
    });

    await prisma.listing.createMany({
      data: [
        listing(LISTING_IDS[0]!, '10000.00', 2019),
        listing(LISTING_IDS[1]!, '12000.00', 2020),
        listing(LISTING_IDS[2]!, '14000.00', 2021),
        listing(LISTING_IDS[3]!, '500.00', 2010),
        listing(LISTING_IDS[4]!, '500.00', 2020, { status: 'unavailable' }),
        listing(LISTING_IDS[5]!, '500.00', 2020, { model: 'Yaris' }),
      ],
    });
  });

  afterAll(async () => {
    await cleanup(prisma);
    await prisma.$disconnect();
  });

  it('discovers and calls both tools through a real child process, then shuts it down', async () => {
    const client = new Client({ name: 'integration-client', version: '1.0.0' });
    const transport = createServerTransport({ stderr: 'pipe' });
    let stderr = '';
    transport.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    await client.connect(transport);
    const pid = transport.pid;
    expect(pid).toBeTypeOf('number');

    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name).sort()).toEqual([
      'check_known_issues',
      'estimate_market_price',
    ]);
    expect(listed.tools.every(({ inputSchema }) =>
      Array.isArray(inputSchema.required)
      && inputSchema.required.includes('brand')
      && inputSchema.required.includes('model'))).toBe(true);

    const issues = await client.callTool({
      name: 'check_known_issues',
      arguments: { brand: 'toyota', model: 'COROLLA', year: 2020 },
    });
    expect(issues.structuredContent).toEqual({
      hasKnownIssues: true,
      issues: [{
        id: ISSUE_ID,
        description: 'Integration issue',
        severity: 'medium',
        yearFrom: 2019,
        yearTo: null,
        sourceUrl: 'https://example.com/integration-issue',
      }],
    });

    const prices = await client.callTool({
      name: 'estimate_market_price',
      arguments: { brand: 'TOYOTA', model: 'corolla', year: 2020 },
    });
    expect(prices.structuredContent).toMatchObject({
      status: 'ok',
      sampleSize: 3,
      average: '12000.00',
      median: '12000.00',
      minimum: '10000.00',
      maximum: '14000.00',
    });

    const invalid = await client.callTool({
      name: 'check_known_issues',
      arguments: { brand: '', model: 'Corolla' },
    });
    expect(invalid.isError).toBe(true);

    await client.close();
    await waitForExit(pid!);
    expect(stderr).not.toContain('stdout');
    expect(stderr).not.toContain('DATABASE_URL');
  });
});

function listing(
  externalId: string,
  price: string,
  year: number,
  overrides: { status?: string; model?: string } = {},
) {
  return {
    externalId,
    provider: 'wallapop',
    title: `Integration ${externalId}`,
    price,
    brand: 'Toyota',
    model: overrides.model ?? 'Corolla',
    year,
    url: `https://wallapop.com/item/${externalId}`,
    images: [],
    contentHash: externalId,
    status: overrides.status ?? 'active',
  };
}

async function cleanup(prisma: DatabaseClient): Promise<void> {
  await prisma.listing.deleteMany({ where: { externalId: { in: LISTING_IDS } } });
  await prisma.knownIssue.deleteMany({ where: { id: ISSUE_ID } });
}

async function waitForExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`MCP child process ${pid} did not exit`);
}
