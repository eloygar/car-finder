import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createPrismaClient, type DatabaseClient } from '../../../shared/src/db/client.js';
import { KNOWN_MODEL_ISSUES_VERSION } from '../../../shared/src/knownModelIssues.js';
import { Prisma } from '../../../prisma/generated/client/client.js';
import { createApp } from '../../src/app.js';

const brand = 'RankIntegrationBrand';
const externalIds = [
  'rank-best', 'rank-issue', 'rank-unknown', 'rank-legacy',
  'rank-non-operational', 'rank-inactive', 'rank-unclassified', 'rank-other-model',
];
const nestedClassification = (status: 'operational' | 'unknown' | 'non_operational') => ({
  operability: { status, confidence: 'high', evidence: [], reason: 'Resultado de integración.' },
});

describe('classified listings search with real PostgreSQL', () => {
  let prisma: DatabaseClient;
  let vehicleModelId: string;

  beforeAll(async () => {
    prisma = createPrismaClient();
    await prisma.listing.deleteMany({ where: { externalId: { in: externalIds } } });
    await prisma.vehicleModel.deleteMany({ where: { normalizedBrand: brand.toLocaleLowerCase('es') } });
    const model = await prisma.vehicleModel.create({ data: {
      source: 'wallapop', brand, model: 'Rank Model', normalizedBrand: brand.toLocaleLowerCase('es'),
      normalizedModel: 'rank model', taxonomyStatus: 'provisional', active: true,
    } });
    vehicleModelId = model.id;
    const otherModel = await prisma.vehicleModel.create({ data: {
      source: 'wallapop', brand, model: 'Only Broken', normalizedBrand: brand.toLocaleLowerCase('es'),
      normalizedModel: 'only broken', taxonomyStatus: 'canonical', active: true,
    } });
    const knownIssues = await prisma.knownModelIssues.create({ data: {
      vehicleModelId: model.id, year: 2020, mechanical: ['Fallo conocido de refrigeración.'],
      bodywork: [], interior: [], other: [], sources: [], hasIssues: true,
      analysisVersion: KNOWN_MODEL_ISSUES_VERSION, anthropicModel: 'test', researchedAt: new Date(),
    } });
    const standard = {
      provider: 'wallapop', brand, model: 'Rank Model', year: 2020,
      url: 'https://example.test/rank', images: [] as string[], contentHash: 'rank-hash',
      status: 'active', vehicleModelId: model.id, knownModelIssuesId: knownIssues.id,
      classifiedAt: new Date('2026-08-27T10:00:00Z'), classificationVersion: 'v5-operability-listing-issues',
    };
    await prisma.listing.createMany({ data: [
      { ...standard, externalId: externalIds[0]!, title: 'Best', price: '13000', mileage: 70_000,
        latitude: 42.2406, longitude: -8.7207, classification: nestedClassification('operational'),
        lastSeenAt: new Date('2026-08-27T14:00:00Z') },
      { ...standard, externalId: externalIds[1]!, title: 'Issue', price: '13000', mileage: 70_000,
        latitude: 42.2406, longitude: -8.7207, classification: nestedClassification('operational'),
        lastSeenAt: new Date('2026-08-27T13:00:00Z') },
      { ...standard, externalId: externalIds[2]!, title: 'Unknown', price: '14500', mileage: 160_000,
        latitude: 42.2406, longitude: -8.7207, classification: nestedClassification('unknown'),
        lastSeenAt: new Date('2026-08-27T12:00:00Z') },
      { ...standard, externalId: externalIds[3]!, title: 'Legacy', price: '16000', mileage: 170_000,
        latitude: null, longitude: null,
        classification: { status: 'operational', confidence: 'high', evidence: [], reason: 'Legacy operativo.' },
        classificationVersion: 'v2-operability', lastSeenAt: new Date('2026-08-27T11:00:00Z') },
      { ...standard, externalId: externalIds[4]!, title: 'Broken', price: '5000', mileage: 20_000,
        latitude: 42.2406, longitude: -8.7207, classification: nestedClassification('non_operational') },
      { ...standard, externalId: externalIds[5]!, title: 'Inactive', price: '5000', mileage: 20_000,
        latitude: 42.2406, longitude: -8.7207, classification: nestedClassification('operational'), status: 'inactive' },
      { ...standard, externalId: externalIds[6]!, title: 'Unclassified', price: '5000', mileage: 20_000,
        latitude: 42.2406, longitude: -8.7207, classification: Prisma.DbNull,
        classifiedAt: null, classificationVersion: null },
      { ...standard, externalId: externalIds[7]!, title: 'Other broken model', price: '5000', mileage: 20_000,
        latitude: 42.2406, longitude: -8.7207, classification: nestedClassification('non_operational'),
        vehicleModelId: otherModel.id, knownModelIssuesId: null, model: 'Only Broken' },
    ] });
    const issueListing = await prisma.listing.findUniqueOrThrow({
      where: { provider_externalId: { provider: 'wallapop', externalId: externalIds[1]! } },
    });
    await prisma.listingIssueExtraction.create({ data: {
      listingId: issueListing.id, inputHash: 'ranking-issue', anthropicModel: 'test',
      analysisVersion: 'v4-explicit-present-defects', extractedAt: new Date(),
      issues: { create: {
        issueKey: 'critical-issue', category: 'mechanical', description: 'Pierde refrigerante.',
        evidence: ['pierde refrigerante'], assessment: { create: {
          severity: 'critical', estimatedCostMinEUR: 500, estimatedCostMaxEUR: 1_000,
          reasoning: 'Debe repararse antes de circular.', sources: [], pricingYear: 2026,
          anthropicModel: 'test', analysisVersion: 'v1', assessedAt: new Date(),
        } },
      } },
    } });
  });

  afterAll(async () => {
    await prisma.listing.deleteMany({ where: { externalId: { in: externalIds } } });
    await prisma.vehicleModel.deleteMany({ where: { normalizedBrand: brand.toLocaleLowerCase('es') } });
    await prisma.$disconnect();
  });

  it('offers only models that have active operational or unknown classified listings', async () => {
    const app = await createApp({ logger: false, serveWeb: false });
    const response = await app.inject({ method: 'GET', url: '/api/classified-listings/search-options' });
    await app.close();
    expect(response.statusCode).toBe(200);
    const brandEntry = response.json().brands.find((entry: { brand: string }) => entry.brand === brand);
    expect(brandEntry.models).toEqual([expect.objectContaining({ id: vehicleModelId, model: 'Rank Model', taxonomyStatus: 'provisional' })]);
    expect(response.json().locations).toEqual([expect.objectContaining({ id: 'vigo', label: 'Vigo' })]);
  });

  it('excludes ineligible listings, supports legacy operability, ranks, and paginates deterministically', async () => {
    const app = await createApp({ logger: false, serveWeb: false });
    const first = await app.inject({
      method: 'POST', url: '/api/classified-listings/search',
      payload: { vehicleModelId, priceTargetMax: 15_000, mileageTargetMax: 150_000, locationId: 'vigo', page: 1, pageSize: 2 },
    });
    const second = await app.inject({
      method: 'POST', url: '/api/classified-listings/search',
      payload: { vehicleModelId, priceTargetMax: 15_000, mileageTargetMax: 150_000, locationId: 'vigo', page: 2, pageSize: 2 },
    });
    await app.close();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ total: 4, page: 1, pageSize: 2 });
    expect(first.json().features).toEqual({ listingIssueAssessments: false });
    expect(first.json().items.map((item: { listing: { externalId: string } }) => item.listing.externalId))
      .toEqual(['rank-best', 'rank-issue']);
    expect(second.json().items.map((item: { listing: { externalId: string } }) => item.listing.externalId))
      .toEqual(['rank-unknown', 'rank-legacy']);
    expect(first.json().items[0].ranking).toMatchObject({ score: 99, distanceKm: 0, version: 'v1' });
    expect(first.json().items[1].listing.listingIssueExtraction.issues[0].assessment).toBeNull();
    expect(first.json().items[1].ranking.breakdown)
      .toContainEqual(expect.objectContaining({ factor: 'listing_issues', delta: -1 }));
    expect(second.json().items[1].listing.classification.status).toBe('operational');
  });

  it('returns a safe 404 for a valid but missing model identity', async () => {
    const app = await createApp({ logger: false, serveWeb: false });
    const response = await app.inject({
      method: 'POST', url: '/api/classified-listings/search',
      payload: {
        vehicleModelId: '11111111-1111-4111-8111-111111111111',
        priceTargetMax: 15_000, mileageTargetMax: 150_000, locationId: 'vigo',
      },
    });
    await app.close();
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'vehicle_model_not_found' });
  });
});
