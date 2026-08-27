import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPrismaClient, type DatabaseClient } from '../../../shared/src/db/client.js';
import { createApp } from '../../src/app.js';
import { issueKey } from '../../../shared/src/modelIssueAssessment.js';

const brand = 'FacetIntegrationBrand';
const externalIds = ['facet-integration-found', 'facet-integration-none', 'facet-integration-pending', 'facet-integration-legacy'];
const operability = (status: 'operational' | 'non_operational' | 'unknown') => ({
  status, confidence: 'high', evidence: [], reason: 'Resultado de integración.',
});

describe('listing facets classification filters', () => {
  let prisma: DatabaseClient;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.listing.deleteMany({ where: { externalId: { in: externalIds } } });
    await prisma.vehicleModel.deleteMany({ where: { normalizedBrand: brand.toLocaleLowerCase('es') } });
    for (const [index, externalId] of externalIds.entries()) {
      const model = await prisma.vehicleModel.create({ data: {
        source: 'wallapop', brand, model: `Model ${index}`, normalizedBrand: brand.toLocaleLowerCase('es'),
        normalizedModel: `model ${index}`, taxonomyStatus: 'provisional', active: true,
      } });
      const issues = index < 2 ? await prisma.knownModelIssues.create({ data: {
        vehicleModelId: model.id, year: 2020,
        mechanical: index === 0 ? ['Fallo conocido.'] : [], bodywork: [], interior: [], other: [], sources: [],
        hasIssues: index === 0, analysisVersion: 'v1-categorized', anthropicModel: 'test', researchedAt: new Date(),
      } }) : null;
      if (index === 0) {
        await prisma.modelIssueAssessment.create({ data: {
          vehicleModelId: model.id, issueKey: issueKey('Fallo conocido.'), issueText: 'Fallo conocido.',
          severity: 'critical', estimatedCostMinEUR: 900, estimatedCostMaxEUR: 2_000,
          reasoning: 'La incidencia requiere reparación inmediata.',
          sources: [{ title: 'Taller', url: 'https://example.test/taller' }], pricingYear: 2026,
          anthropicModel: 'test', analysisVersion: 'v1', assessedAt: new Date(),
        } });
        await prisma.modelIssueAssessment.create({ data: {
          vehicleModelId: model.id, issueKey: issueKey('Incidencia eliminada.'), issueText: 'Incidencia eliminada.',
          severity: 'low', estimatedCostMinEUR: 50, estimatedCostMaxEUR: 100,
          reasoning: 'Evaluación histórica.', sources: [{ title: 'Taller', url: 'https://example.test/old' }],
          pricingYear: 2025, anthropicModel: 'test', analysisVersion: 'v1', assessedAt: new Date(),
        } });
      }
      await prisma.listing.create({ data: {
        externalId, title: `Facet integration ${index}`, price: '10000.00', brand, model: `Model ${index}`,
        year: 2020, url: `https://example.test/${externalId}`, images: [], contentHash: externalId,
        classification: index === 3 ? operability('operational') : {
          operability: operability(index === 0 ? 'operational' : index === 1 ? 'unknown' : 'non_operational'),
        },
        classificationVersion: index === 3 ? 'v2-operability' : 'v4-operability-model-issues',
        classifiedAt: new Date('2026-08-27T10:00:00Z'), vehicleModelId: model.id,
        knownModelIssuesId: issues?.id,
      } });
    }
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'wallapop', externalId: externalIds[0]! } },
    });
    await prisma.listingIssueExtraction.create({ data: {
      listingId: listing.id, inputHash: 'facet-listing-input', anthropicModel: 'test',
      analysisVersion: 'v1-explicit-defects', extractedAt: new Date('2026-08-27T10:00:00Z'),
      issues: { create: {
        issueKey: issueKey('Tiene un golpe en la puerta.'), category: 'bodywork',
        description: 'Tiene un golpe en la puerta.', evidence: ['golpe en puerta'],
        assessment: { create: {
          severity: 'low', estimatedCostMinEUR: 150, estimatedCostMaxEUR: 450,
          reasoning: 'El daño de chapa es reparable.',
          sources: [{ title: 'Taller de chapa', url: 'https://example.test/chapa' }],
          pricingYear: 2026, anthropicModel: 'test', analysisVersion: 'v1', assessedAt: new Date(),
        } },
      } },
    } });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { externalId: { in: externalIds } } });
    await prisma.vehicleModel.deleteMany({ where: { normalizedBrand: brand.toLocaleLowerCase('es') } });
    await prisma.$disconnect();
  });

  it('combines v4 operability and relational issue filters', async () => {
    const app = await createApp({ executeSearch: async () => neverSearch(), logger: false, serveWeb: false });
    const found = await app.inject({
      method: 'GET', url: `/api/listings/facets?brand=${brand}&operability=operational&knownIssues=found`,
    });
    const none = await app.inject({ method: 'GET', url: `/api/listings/facets?brand=${brand}&knownIssues=none` });
    const pending = await app.inject({ method: 'GET', url: `/api/listings/facets?brand=${brand}&knownIssues=pending` });
    await app.close();
    expect(found.json().brands).toEqual([{ brand, count: 1 }]);
    expect(none.json().brands).toEqual([{ brand, count: 1 }]);
    expect(pending.json().brands).toEqual([{ brand, count: 2 }]);
  });

  it('uses both nested and legacy operability paths', async () => {
    const app = await createApp({ executeSearch: async () => neverSearch(), logger: false, serveWeb: false });
    const response = await app.inject({ method: 'GET', url: `/api/listings/facets?brand=${brand}&operability=operational` });
    await app.close();
    expect(response.json().brands).toEqual([{ brand, count: 2 }]);
  });

  it('returns categorized issues through the listing relation', async () => {
    const app = await createApp({ executeSearch: async () => neverSearch(), logger: false, serveWeb: false });
    const response = await app.inject({ method: 'GET', url: `/api/listings?brand=${brand}` });
    await app.close();
    const found = response.json().items.find((item: { externalId: string }) => item.externalId === externalIds[0]);
    expect(response.json().features).toEqual({ modelIssueAssessments: false });
    expect(found.classification).toEqual({ operability: operability('operational') });
    expect(found.knownModelIssues).toMatchObject({
      mechanical: ['Fallo conocido.'], bodywork: [], interior: [], other: [], hasIssues: true,
      issueAssessments: [{
        issue: 'Fallo conocido.', category: 'mechanical',
        assessment: { severity: 'critical', estimatedCostMinEUR: 900, pricingYear: 2026 },
      }],
    });
    expect(found.listingIssueExtraction).toMatchObject({
      extractedAt: '2026-08-27T10:00:00.000Z',
      issues: [{
        category: 'bodywork', description: 'Tiene un golpe en la puerta.', evidence: ['golpe en puerta'],
        assessment: { severity: 'low', estimatedCostMinEUR: 150, pricingYear: 2026 },
      }],
    });
  });
});

function neverSearch(): never { throw new Error('Search is not used in listing facet tests'); }
