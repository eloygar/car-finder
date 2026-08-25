import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '../src/db/client.js';
import { PrismaListingRepository } from '../src/reconcile/PrismaListingRepository.js';
import type { PreparedListing, ReconciliationAction } from '../src/reconcile/types.js';

function prepared(overrides: Partial<PreparedListing> = {}): PreparedListing {
  return {
    externalId: 'listing-1',
    provider: 'wallapop',
    title: 'Toyota Corolla',
    description: 'Description',
    price: '10000.00',
    brand: 'Toyota',
    model: 'Corolla',
    year: 2020,
    mileage: 50_000,
    fuelType: 'hybrid',
    transmission: 'automatic',
    power: 122,
    bodyType: 'sedan',
    province: 'Madrid',
    latitude: 40.4,
    longitude: -3.7,
    url: 'https://wallapop.com/item/car-1',
    images: ['image.jpg'],
    publishedAt: new Date('2026-01-01T00:00:00Z'),
    sellerType: null,
    sellerName: null,
    rawPayload: { id: 'listing-1' },
    contentHash: 'hash-1',
    ...overrides,
  };
}

function mockPrisma() {
  const findMany = vi.fn().mockResolvedValue([]);
  const create = vi.fn().mockResolvedValue({});
  const update = vi.fn().mockResolvedValue({});
  const transaction = vi.fn(
    async (callback: (client: unknown) => Promise<void>, _options?: unknown) =>
      callback({ listing: { create, update } }),
  );
  const prisma = {
    listing: { findMany },
    $transaction: transaction,
  } as unknown as DatabaseClient;
  return { prisma, findMany, create, update, transaction };
}

describe('PrismaListingRepository', () => {
  it('fetches only matching Wallapop external IDs', async () => {
    const { prisma, findMany } = mockPrisma();
    const repository = new PrismaListingRepository(prisma);

    await repository.findExisting(['one', 'two']);

    expect(findMany).toHaveBeenCalledWith({
      where: { provider: 'wallapop', externalId: { in: ['one', 'two'] } },
      select: { externalId: true, contentHash: true, status: true },
    });
  });

  it('writes every action inside one transaction', async () => {
    const { prisma, create, update, transaction } = mockPrisma();
    const repository = new PrismaListingRepository(prisma);
    const seenAt = new Date('2026-08-25T12:00:00Z');
    const actions: ReconciliationAction[] = [
      { kind: 'create', listing: prepared({ externalId: 'new' }) },
      {
        kind: 'update',
        listing: prepared({ externalId: 'changed' }),
        classificationChanged: true,
      },
      {
        kind: 'update',
        listing: prepared({ externalId: 'unchanged' }),
        classificationChanged: false,
      },
    ];

    await repository.apply(actions, seenAt);

    expect(transaction).toHaveBeenCalledOnce();
    expect(transaction.mock.calls[0]?.[1]).toEqual({ timeout: 60_000 });
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      externalId: 'new',
      status: 'active',
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
    });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it('clears AI fields only when classification inputs changed', async () => {
    const { prisma, update } = mockPrisma();
    const repository = new PrismaListingRepository(prisma);

    await repository.apply([
      { kind: 'update', listing: prepared({ externalId: 'changed' }), classificationChanged: true },
      { kind: 'update', listing: prepared({ externalId: 'same' }), classificationChanged: false },
    ], new Date());

    expect(update.mock.calls[0]?.[0].data).toMatchObject({
      isDamaged: null,
      damageConfidence: null,
      repairCostEstimate: null,
      repairCostReasoning: null,
      knownIssues: null,
      knownIssuesDetail: null,
      classificationVersion: null,
      classifiedAt: null,
    });
    expect(update.mock.calls[1]?.[0].data).not.toHaveProperty('classifiedAt');
    expect(update.mock.calls[1]?.[0].data).not.toHaveProperty('isDamaged');
  });

  it('propagates transaction failures', async () => {
    const { prisma, transaction } = mockPrisma();
    transaction.mockRejectedValueOnce(new Error('database failure'));
    const repository = new PrismaListingRepository(prisma);

    await expect(
      repository.apply([{ kind: 'create', listing: prepared() }], new Date()),
    ).rejects.toThrow('database failure');
  });
});
