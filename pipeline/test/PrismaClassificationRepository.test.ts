import { describe, expect, it, vi } from 'vitest';
import { PrismaClassificationRepository } from '../src/classify/PrismaClassificationRepository.js';
import type { DatabaseClient } from '../src/db/client.js';
import type { ClassificationCandidate } from '../src/classify/types.js';

const candidate: ClassificationCandidate = {
  id: 'db-1', externalId: 'wallapop-1', contentHash: 'hash-1', title: 'Toyota Corolla', description: null,
  price: '12345.60', brand: 'Toyota', model: 'Corolla', year: 2020, mileage: 40_000,
  fuelType: 'hybrid', transmission: 'automatic', bodyType: 'sedan', images: [],
};
const classification = {
  operability: { status: 'operational' as const, confidence: 'high' as const, evidence: ['funciona'], reason: 'Funciona.' },
};

function fakeClient(updateCount = 1) {
  const listing = {
    findMany: vi.fn().mockResolvedValue([{ ...candidate, price: { toFixed: () => candidate.price } }]),
    updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
  };
  const tx = {
    listing,
    vehicleModel: { upsert: vi.fn().mockResolvedValue({ id: 'vehicle-model-1' }) },
    knownModelIssues: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({ id: 'issues-1' }),
    },
  };
  const prisma = {
    listing,
    vehicleModel: { findUnique: vi.fn().mockResolvedValue({ id: 'vehicle-model-1' }) },
    knownModelIssues: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(async (callback: (value: typeof tx) => Promise<void>) => callback(tx)),
  };
  return { prisma: prisma as unknown as DatabaseClient, listing, tx };
}

describe('PrismaClassificationRepository', () => {
  it('selects pending rows in stable order and applies the limit', async () => {
    const { prisma, listing } = fakeClient();
    const repository = new PrismaClassificationRepository(prisma);
    const candidates = await repository.findCandidates(
      { all: false, dryRun: false, force: false, refreshKnownIssues: false, limit: 7 }, 'v4',
    );
    expect(listing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'active', OR: [{ classifiedAt: null }, { classificationVersion: null }, { classificationVersion: { not: 'v4' } }] },
      take: 7,
    }));
    expect(candidates[0]?.price).toBe('12345.60');
  });

  it('persists identity, categorized issues and listing atomically', async () => {
    const { prisma, tx } = fakeClient();
    const repository = new PrismaClassificationRepository(prisma);
    const classifiedAt = new Date('2026-08-25T12:00:00Z');
    await expect(repository.saveClassification({
      candidate, classification, version: 'v4', classifiedAt,
      researchedIssues: {
        analysis: {
          mechanical: ['Bomba de agua.'], bodywork: [], interior: [], other: [],
          sources: [{ title: 'Source', url: 'https://example.test' }],
        },
        anthropicModel: 'claude-haiku', analysisVersion: 'v1-categorized',
      },
    })).resolves.toBe(true);
    expect(tx.knownModelIssues.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ year: 2020, hasIssues: true, mechanical: ['Bomba de agua.'] }),
    }));
    expect(tx.listing.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'db-1', contentHash: 'hash-1', status: 'active' },
      data: expect.objectContaining({ classification, vehicleModelId: 'vehicle-model-1', knownModelIssuesId: 'issues-1' }),
    }));
  });

  it('rolls back stale optimistic updates', async () => {
    const { prisma } = fakeClient(0);
    const repository = new PrismaClassificationRepository(prisma);
    await expect(repository.saveClassification({
      candidate, classification, version: 'v4', classifiedAt: new Date(),
    })).resolves.toBe(false);
  });
});
