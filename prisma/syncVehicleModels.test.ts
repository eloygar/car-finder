import { describe, expect, it, vi } from 'vitest';
import type { DatabaseClient } from '../shared/src/db/client.js';
import { syncVehicleModels } from './syncVehicleModels.js';

describe('syncVehicleModels', () => {
  it('is idempotent, promotes exact provisional identities, deactivates removed models, and backfills links', async () => {
    const models = new Map<string, Record<string, unknown>>([
      ['wallapop\0toyota\0corolla', {
        id: 'corolla-id', source: 'wallapop', normalizedBrand: 'toyota', normalizedModel: 'corolla',
        brand: 'toyota', model: 'corolla', taxonomyStatus: 'provisional', active: true,
      }],
      ['wallapop\0removed\0model', {
        id: 'removed-id', source: 'wallapop', normalizedBrand: 'removed', normalizedModel: 'model',
        brand: 'Removed', model: 'Model', taxonomyStatus: 'canonical', active: true,
      }],
    ]);
    const listings = [
      { brand: 'Toyota', model: 'Corolla', year: 2020, vehicleModelId: null as string | null, knownModelIssuesId: null as string | null },
      { brand: 'Unknown', model: 'Prototype', year: 2021, vehicleModelId: null as string | null, knownModelIssuesId: null as string | null },
      { brand: 'Removed', model: 'Model', year: 2019, vehicleModelId: null as string | null, knownModelIssuesId: null as string | null },
    ];
    let nextId = 1;
    const fake = {
      vehicleModel: {
        updateMany: vi.fn(async () => {
          for (const value of models.values()) if (value.taxonomyStatus === 'canonical') value.active = false;
          return { count: 1 };
        }),
        upsert: vi.fn(async ({ create, update }: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          const key = `${create.source}\0${create.normalizedBrand}\0${create.normalizedModel}`;
          const current = models.get(key);
          const value = current ? Object.assign(current, update) : { id: `new-${nextId++}`, ...create };
          models.set(key, value);
          return value;
        }),
      },
      listing: {
        findMany: vi.fn(async () => listings.map(({ brand, model }) => ({ brand, model }))),
        updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, string> }) => {
          for (const listing of listings) {
            if ('brand' in where && (listing.brand !== where.brand || listing.model !== where.model)) continue;
            if ('vehicleModelId' in where && (listing.vehicleModelId !== where.vehicleModelId || listing.year !== where.year)) continue;
            Object.assign(listing, data);
          }
          return { count: 1 };
        }),
      },
      knownModelIssues: {
        findMany: vi.fn(async () => [{ id: 'issues-1', vehicleModelId: 'corolla-id', year: 2020 }]),
      },
      $disconnect: vi.fn(),
    };

    await syncVehicleModels(fake as unknown as DatabaseClient);
    await syncVehicleModels(fake as unknown as DatabaseClient);

    expect(models.get('wallapop\0toyota\0corolla')).toMatchObject({
      id: 'corolla-id', brand: 'Toyota', model: 'Corolla', taxonomyStatus: 'canonical', active: true,
    });
    expect(models.get('wallapop\0removed\0model')).toMatchObject({ active: false });
    expect(models.get('wallapop\0unknown\0prototype')).toMatchObject({ taxonomyStatus: 'provisional' });
    expect(listings[0]).toMatchObject({ vehicleModelId: 'corolla-id', knownModelIssuesId: 'issues-1' });
    expect(fake.$disconnect).not.toHaveBeenCalled();
    expect(models.size).toBeGreaterThan(1_000);
  });
});
