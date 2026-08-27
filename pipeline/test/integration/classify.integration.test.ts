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
    await prisma.vehicleModel.deleteMany({
      where: { normalizedBrand: { in: ['integrationbrand', 'atomicintegrationbrand'] } },
    });
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
    await prisma.vehicleModel.deleteMany({
      where: { normalizedBrand: { in: ['integrationbrand', 'atomicintegrationbrand'] } },
    });
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
          reason: 'La descripción indica que funciona y se usa a diario.',
        },
        model: 'claude-sonnet-5',
        usage: { inputTokens: 10, outputTokens: 5, webSearchRequests: 0 },
      })
      .mockResolvedValueOnce({
        knownIssues: {
          mechanical: ['Fallo conocido de integración.'], bodywork: [], interior: [], other: [],
          sources: [{ title: 'Source', url: 'https://example.com/integration-issue' }],
        },
        model: 'claude-haiku-4-5-20251001',
        usage: { inputTokens: 12, outputTokens: 6, webSearchRequests: 1 },
      });

    const summary = await runClassification({
      run: { all: false, dryRun: false, force: false, refreshKnownIssues: false, only: externalIds[0] },
      repository,
      logger,
      createSession: async () => {
        const classifier = await SequentialMcpClassifier.create({
          mcp: {
            listTools: async () => [
              { name: 'check_operational_status' }, { name: 'check_known_issues_web' },
            ],
            callTool,
          },
        });
        return { classifier, close: async () => undefined };
      },
    });

    expect(summary).toMatchObject({ selected: 1, classified: 1, failed: 0, stale: 0 });
    expect(callTool.mock.calls.map(([name]) => name)).toEqual([
      'check_operational_status', 'check_known_issues_web',
    ]);
    const stored = await prisma.listing.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'wallapop', externalId: externalIds[0]! } },
    });
    expect(stored).toMatchObject({ classificationVersion: 'v4-operability-model-issues' });
    expect(stored.classification).toMatchObject({
      operability: {
        status: 'operational', confidence: 'high',
        evidence: ['Funciona perfectamente', 'se usa a diario'],
      },
    });
    const relationalIssues = await prisma.knownModelIssues.findUniqueOrThrow({
      where: { id: stored.knownModelIssuesId! },
    });
    expect(relationalIssues).toMatchObject({ mechanical: ['Fallo conocido de integración.'], hasIssues: true });

    const second = await runClassification({
      run: { all: false, dryRun: true, force: false, refreshKnownIssues: false, only: externalIds[0] },
      repository,
      logger,
    });
    expect(second.selected).toBe(0);
  });

  it('rolls back provisional identity and research when content becomes stale', async () => {
    const row = await prisma.listing.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'wallapop', externalId: externalIds[2]! } },
    });
    const repository = new PrismaClassificationRepository(prisma);
    const saved = await repository.saveClassification({
      candidate: {
        id: row.id, externalId: row.externalId, contentHash: 'stale-hash', title: row.title,
        description: row.description, price: row.price.toFixed(2), brand: 'AtomicIntegrationBrand',
        model: 'AtomicIntegrationModel', year: 2022, mileage: null, fuelType: null,
        transmission: null, bodyType: null, images: [],
      },
      classification: {
        operability: { status: 'operational', confidence: 'high', evidence: ['Funciona'], reason: 'Funciona.' },
      },
      version: 'v4-operability-model-issues', classifiedAt: new Date(),
      researchedIssues: {
        analysis: { mechanical: ['Fallo atómico.'], bodywork: [], interior: [], other: [], sources: [] },
        anthropicModel: 'test', analysisVersion: 'v1-categorized',
      },
    });
    expect(saved).toBe(false);
    expect(await prisma.vehicleModel.findFirst({
      where: { normalizedBrand: 'atomicintegrationbrand' },
    })).toBeNull();
  });
});
