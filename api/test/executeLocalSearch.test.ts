import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { executeLocalSearch } from '../src/localSearch/executeLocalSearch.js';
import type { BatchLogger } from '../../pipeline/src/search.js';

const temporaryDirectories: string[] = [];
const rawListing = {
  id: 'ui-car-1',
  title: 'Toyota Corolla 2020',
  description: 'Hybrid hatchback',
  price: { amount: 18_500, currency: 'EUR' },
  type_attributes: { brand: 'Toyota', model: 'Corolla', year: 2020 },
  web_slug: 'toyota-corolla-ui-car-1',
};
const request = {
  brand: 'Toyota',
  model: 'Corolla',
  locationId: 'madrid',
  distanceMeters: 50_000,
  maxPages: 1,
};
const logger: BatchLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => (
    rm(directory, { recursive: true, force: true })
  )));
  vi.clearAllMocks();
});

describe('executeLocalSearch reconciliation', () => {
  it('reconciles the completed filtered capture and returns its summary', async () => {
    const outputPath = await temporaryOutputPath();
    const searchPage = vi.fn().mockResolvedValue({ items: [rawListing] });
    const reconcile = vi.fn().mockResolvedValue({
      total: 1,
      created: 1,
      changed: 0,
      unchanged: 0,
      reactivated: 0,
      dryRun: false,
    });

    const result = await executeLocalSearch({
      ...request,
      engine: 'hybride',
      transmission: 'automatic',
      bodyType: 'sedan',
      price: { min: 10_000, max: 20_000 },
    }, logger, {
      client: { searchPage },
      outputPath,
      reconcile,
    });

    expect(searchPage).toHaveBeenCalledWith(expect.objectContaining({
      model: 'Corolla',
      engine: 'hybride',
      transmission: 'automatic',
      bodyType: 'sedan',
      priceMin: 10_000,
      priceMax: 20_000,
    }));
    expect(reconcile).toHaveBeenCalledWith([rawListing]);
    expect(result.reconciliation).toEqual({
      status: 'completed',
      summary: expect.objectContaining({ total: 1, created: 1 }),
    });
    expect(JSON.parse(await readFile(outputPath, 'utf8'))).toEqual([rawListing]);
  });

  it('keeps a successful capture and reports a database failure safely', async () => {
    const outputPath = await temporaryOutputPath();

    const result = await executeLocalSearch(request, logger, {
      client: { searchPage: vi.fn().mockResolvedValue({ items: [rawListing] }) },
      outputPath,
      reconcile: vi.fn().mockRejectedValue(new Error('secret database failure')),
    });

    expect(result.reconciliation).toEqual({
      status: 'failed',
      message: 'La captura se ha guardado, pero no se ha podido actualizar la base de datos.',
    });
    expect(JSON.parse(await readFile(outputPath, 'utf8'))).toEqual([rawListing]);
    expect(logger.error).toHaveBeenCalledWith(
      { errorType: 'Error' },
      'Local UI reconciliation failed after capture',
    );
  });
});

async function temporaryOutputPath(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'car-finder-ui-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'raw-listings.json');
}
