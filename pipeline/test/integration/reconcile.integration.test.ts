import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient, type DatabaseClient } from '../../src/db/client.js';
import { PrismaListingRepository } from '../../src/reconcile/PrismaListingRepository.js';
import { reconcileListings } from '../../src/reconcile/reconcileListings.js';

const integrationIds = ['integration-one', 'integration-absent'];

function raw(id: string, description = 'Original description') {
  return {
    id,
    title: 'Toyota Corolla',
    description,
    price: { amount: 10_000, currency: 'EUR' },
    type_attributes: { brand: 'Toyota', model: 'Corolla', year: 2020, km: 50_000 },
    location: { region2: 'Madrid' },
    web_slug: `toyota-corolla-${id}`,
  };
}

describe('PostgreSQL reconciliation', () => {
  let prisma: DatabaseClient;
  let repository: PrismaListingRepository;

  beforeAll(async () => {
    prisma = createPrismaClient();
    repository = new PrismaListingRepository(prisma);
    await prisma.listing.deleteMany({
      where: { provider: 'wallapop', externalId: { in: integrationIds } },
    });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({
      where: { provider: 'wallapop', externalId: { in: integrationIds } },
    });
    await prisma.$disconnect();
  });

  it('is idempotent, clears stale classification, and leaves absent rows active', async () => {
    const first = await reconcileListings({ rawItems: [raw('integration-one')], repository });
    expect(first).toMatchObject({ created: 1, changed: 0, unchanged: 0 });

    const second = await reconcileListings({ rawItems: [raw('integration-one')], repository });
    expect(second).toMatchObject({ created: 0, changed: 0, unchanged: 1 });

    await prisma.listing.update({
      where: {
        provider_externalId: { provider: 'wallapop', externalId: 'integration-one' },
      },
      data: {
        isDamaged: true,
        classifiedAt: new Date(),
        classificationVersion: 'test-v1',
      },
    });
    await prisma.listing.create({
      data: {
        externalId: 'integration-absent',
        provider: 'wallapop',
        title: 'Absent listing',
        price: '1.00',
        brand: 'Toyota',
        model: 'Corolla',
        url: 'https://wallapop.com/item/integration-absent',
        images: [],
        contentHash: 'existing',
      },
    });

    const changed = await reconcileListings({
      rawItems: [raw('integration-one', 'Changed description')],
      repository,
    });
    expect(changed).toMatchObject({ changed: 1 });

    const rows = await prisma.listing.findMany({
      where: { provider: 'wallapop', externalId: { in: integrationIds } },
      orderBy: { externalId: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.externalId === 'integration-one')).toMatchObject({
      description: 'Changed description',
      isDamaged: null,
      classifiedAt: null,
      classificationVersion: null,
    });
    expect(rows.find((row) => row.externalId === 'integration-absent')?.status).toBe('active');
  });
});
