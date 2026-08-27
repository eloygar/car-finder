import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient, type DatabaseClient } from '../../../shared/src/db/client.js';
import { createApp } from '../../src/app.js';

const brand = 'FacetIntegrationBrand';
const externalIds = [
  'facet-integration-found',
  'facet-integration-none',
  'facet-integration-skipped',
  'facet-integration-legacy',
];
const operability = (status: 'operational' | 'non_operational' | 'unknown') => ({
  status,
  confidence: 'high',
  evidence: [],
  reason: 'Resultado de integración.',
});

describe('listing facets classification filters', () => {
  let prisma: DatabaseClient;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.listing.deleteMany({ where: { externalId: { in: externalIds } } });
    const classifications = [
      {
        operability: operability('operational'),
        knownIssuesWeb: { status: 'completed', found: true, summary: 'Hay problemas.', sources: [] },
      },
      {
        operability: operability('unknown'),
        knownIssuesWeb: { status: 'completed', found: false, summary: 'No hay problemas.', sources: [] },
      },
      {
        operability: operability('non_operational'),
        knownIssuesWeb: { status: 'skipped', reason: 'non_operational' },
      },
      operability('operational'),
    ];
    for (const [index, externalId] of externalIds.entries()) {
      await prisma.listing.create({
        data: {
          externalId,
          title: `Facet integration ${index}`,
          price: '10000.00',
          brand,
          model: `Model ${index}`,
          url: `https://example.test/${externalId}`,
          images: [],
          contentHash: externalId,
          classification: classifications[index]!,
          classificationVersion: index === 3 ? 'v2-operability' : 'v3-operability-web-issues',
          classifiedAt: new Date('2026-08-27T10:00:00Z'),
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { externalId: { in: externalIds } } });
    await prisma.$disconnect();
  });

  it('combines v3 operability and known-issues filters', async () => {
    const app = await createApp({ executeSearch: async () => neverSearch(), logger: false, serveWeb: false });
    const found = await app.inject({
      method: 'GET',
      url: `/api/listings/facets?brand=${brand}&operability=operational&knownIssues=found`,
    });
    const skipped = await app.inject({
      method: 'GET',
      url: `/api/listings/facets?brand=${brand}&knownIssues=skipped`,
    });
    await app.close();

    expect(found.statusCode).toBe(200);
    expect(found.json().brands).toEqual([{ brand, count: 1 }]);
    expect(skipped.json().brands).toEqual([{ brand, count: 1 }]);
  });

  it('uses both v3 and legacy operability paths', async () => {
    const app = await createApp({ executeSearch: async () => neverSearch(), logger: false, serveWeb: false });
    const response = await app.inject({
      method: 'GET',
      url: `/api/listings/facets?brand=${brand}&operability=operational`,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().brands).toEqual([{ brand, count: 2 }]);
  });
});

function neverSearch(): never {
  throw new Error('Search is not used in listing facet tests');
}
