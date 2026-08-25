import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient } from '../../shared/src/db/client.js';
import { PrismaMcpToolRepository } from '../src/db/PrismaMcpToolRepository.js';

function mockPrisma() {
  const knownIssueFindMany = vi.fn().mockResolvedValue([]);
  const listingFindMany = vi.fn().mockResolvedValue([
    { price: { toFixed: () => '10000.00' } },
  ]);
  const prisma = {
    knownIssue: { findMany: knownIssueFindMany },
    listing: { findMany: listingFindMany },
  } as unknown as DatabaseClient;
  return { prisma, knownIssueFindMany, listingFindMany };
}

describe('PrismaMcpToolRepository', () => {
  it('matches issues case-insensitively within nullable year bounds', async () => {
    const { prisma, knownIssueFindMany } = mockPrisma();
    const repository = new PrismaMcpToolRepository(prisma);

    await repository.findKnownIssues({ brand: 'toyota', model: 'corolla', year: 2020 });

    expect(knownIssueFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        brand: { equals: 'toyota', mode: 'insensitive' },
        model: { equals: 'corolla', mode: 'insensitive' },
        AND: [
          { OR: [{ yearFrom: null }, { yearFrom: { lte: 2020 } }] },
          { OR: [{ yearTo: null }, { yearTo: { gte: 2020 } }] },
        ],
      },
    }));
  });

  it('selects active positive comparables within a one-year window', async () => {
    const { prisma, listingFindMany } = mockPrisma();
    const repository = new PrismaMcpToolRepository(prisma);

    await expect(repository.findComparablePrices({
      brand: 'Toyota',
      model: 'Corolla',
      year: 2020,
    })).resolves.toEqual(['10000.00']);

    expect(listingFindMany).toHaveBeenCalledWith({
      where: {
        status: 'active',
        brand: { equals: 'Toyota', mode: 'insensitive' },
        model: { equals: 'Corolla', mode: 'insensitive' },
        price: { gt: 0 },
        year: { gte: 2019, lte: 2021 },
      },
      select: { price: true },
    });
  });
});
