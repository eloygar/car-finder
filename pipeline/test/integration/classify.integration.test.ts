import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createPrismaClient, type DatabaseClient } from '../../src/db/client.js';
import { SequentialMcpClassifier } from '../../src/classify/SequentialMcpClassifier.js';
import { PrismaClassificationRepository } from '../../src/classify/PrismaClassificationRepository.js';
import { runClassification } from '../../src/classify/runClassification.js';

const externalIds = ['classify-integration-1', 'classify-integration-2', 'classify-integration-3'];
const issueId = 'classify-integration-issue';
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('classification with real PostgreSQL and MCP stdio', () => {
  let prisma: DatabaseClient;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.listing.deleteMany({ where: { externalId: { in: externalIds } } });
    await prisma.knownIssue.deleteMany({ where: { id: issueId } });
    await prisma.vehicleModel.upsert({
      where: { brand_name: { brand: 'IntegrationBrand', name: 'IntegrationModel' } },
      create: { brand: 'IntegrationBrand', name: 'IntegrationModel', slug: 'integrationbrand-integrationmodel' },
      update: {},
    });
    await prisma.knownIssue.create({
      data: {
        id: issueId,
        brand: 'IntegrationBrand',
        model: 'IntegrationModel',
        yearFrom: 2019,
        yearTo: 2021,
        severity: 'medium',
        issueDescription: 'Integration-only known issue',
        category: 'otros',
        source: 'https://example.com/integration-issue',
        contentHash: 'classify-integration-issue-hash',
        vehicleModel: { connect: { brand_name: { brand: 'IntegrationBrand', name: 'IntegrationModel' } } },
      },
    });
    for (const [index, externalId] of externalIds.entries()) {
      await prisma.listing.create({
        data: {
          externalId,
          title: `Integration car ${index + 1}`,
          description: 'Funciona perfectamente y se usa a diario.',
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

  it('runs both MCP stages, stores JSONB, and becomes idempotent', async () => {
    const repository = new PrismaClassificationRepository(prisma);
    const callTool = vi.fn()
      .mockResolvedValueOnce({
        operability: {
          status: 'operational', confidence: 'high',
          evidence: ['Funciona perfectamente', 'se usa a diario'],
          reason: 'The description explicitly says it works and is used daily.',
        },
        model: 'claude-sonnet-5',
        usage: { inputTokens: 10, outputTokens: 5, webSearchRequests: 0 },
      })
      .mockResolvedValueOnce({
        knownIssues: {
          found: true,
          summary: 'A documented model-level issue exists.',
          sources: [{ title: 'Source', url: 'https://example.com/integration-issue' }],
        },
        model: 'claude-haiku-4-5-20251001',
        usage: { inputTokens: 12, outputTokens: 6, webSearchRequests: 1 },
      });

    const summary = await runClassification({
      run: { all: false, dryRun: false, force: false, only: externalIds[0] },
      repository,
      logger,
      createSession: async () => {
        const classifier = await SequentialMcpClassifier.create({
          mcp: {
            listTools: async () => [{ name: 'check_operational_status' }],
            callTool,
          },
          knownIssuesLookup: (query) => repository.findStoredKnownIssues(query),
        });
        return { classifier, close: async () => undefined };
      },
    });

    expect(summary).toMatchObject({ selected: 1, classified: 1, failed: 0, stale: 0 });
    expect(callTool.mock.calls.map(([name]) => name)).toEqual(['check_operational_status']);
    const stored = await prisma.listing.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'wallapop', externalId: externalIds[0]! } },
    });
    expect(stored).toMatchObject({ classificationVersion: 'v3-operability-web-issues' });
    expect(stored.classification).toMatchObject({
      operability: {
        status: 'operational', confidence: 'high',
        evidence: ['Funciona perfectamente', 'se usa a diario'],
      },
      knownIssuesWeb: { status: 'completed', found: true },
    });

    const second = await runClassification({
      run: { all: false, dryRun: true, force: false, only: externalIds[0] },
      repository,
      logger,
    });
    expect(second.selected).toBe(0);
  });
});
