import { describe, expect, it, vi } from 'vitest';

import { PrismaClassificationRepository } from '../src/classify/PrismaClassificationRepository.js';
import type { DatabaseClient } from '../src/db/client.js';

const classification = {
  operability: {
    status: 'operational' as const,
    confidence: 'high' as const,
    evidence: ['funciona perfectamente'],
    reason: 'The description explicitly says it works.',
  },
  knownIssuesWeb: {
    status: 'completed' as const,
    found: false,
    summary: 'No documented model-level issue was found.',
    sources: [],
  },
};

function row() {
  return {
    id: 'db-1', externalId: 'wallapop-1', contentHash: 'hash-1', title: 'Toyota Corolla',
    description: null, price: { toFixed: () => '12345.60' }, brand: 'Toyota', model: 'Corolla',
    year: 2020, mileage: 40_000, fuelType: 'hybrid', transmission: 'automatic',
    bodyType: 'sedan', images: ['https://cdn.wallapop.com/car.jpg'],
  };
}

function fakeClient() {
  return {
    listing: {
      findMany: vi.fn().mockResolvedValue([row()]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('PrismaClassificationRepository', () => {
  it('selects only active pending or outdated rows in stable order and applies the limit', async () => {
    const prisma = fakeClient();
    const repository = new PrismaClassificationRepository(prisma as unknown as DatabaseClient);
    const candidates = await repository.findCandidates(
      { all: false, dryRun: false, force: false, limit: 7 },
      'v1',
    );

    expect(prisma.listing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: 'active',
        OR: [
          { classifiedAt: null },
          { classificationVersion: null },
          { classificationVersion: { not: 'v1' } },
        ],
      },
      orderBy: [{ firstSeenAt: 'asc' }, { id: 'asc' }],
      take: 7,
    }));
    expect(candidates[0]).toMatchObject({ externalId: 'wallapop-1', price: '12345.60' });
  });

  it('force includes current classifications and only bypasses the batch limit', async () => {
    const prisma = fakeClient();
    const repository = new PrismaClassificationRepository(prisma as unknown as DatabaseClient);
    await repository.findCandidates(
      { all: false, dryRun: false, force: true, limit: 10, only: 'wallapop-1' },
      'v1',
    );

    const query = prisma.listing.findMany.mock.calls[0]![0];
    expect(query.where).toEqual({ status: 'active', externalId: 'wallapop-1' });
    expect(query).not.toHaveProperty('take');
  });

  it('persists only when the original content hash still matches', async () => {
    const prisma = fakeClient();
    const repository = new PrismaClassificationRepository(prisma as unknown as DatabaseClient);
    const classifiedAt = new Date('2026-08-25T12:00:00Z');

    await expect(repository.saveClassification({
      id: 'db-1', contentHash: 'hash-1', classification, version: 'v2-operability', classifiedAt,
    })).resolves.toBe(true);
    expect(prisma.listing.updateMany).toHaveBeenCalledWith({
      where: { id: 'db-1', contentHash: 'hash-1', status: 'active' },
      data: { classification, classificationVersion: 'v2-operability', classifiedAt },
    });

    prisma.listing.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(repository.saveClassification({
      id: 'db-1', contentHash: 'old-hash', classification, version: 'v2-operability', classifiedAt,
    })).resolves.toBe(false);
  });
});
