import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../src/app.js';

describe('local search API', () => {
  it('serves the captured brand/model taxonomy and configured locations', async () => {
    const app = await createApp({ logger: false, serveWeb: false });
    const response = await app.inject({ method: 'GET', url: '/api/taxonomy' });
    await app.close();

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.brands).toEqual(expect.arrayContaining(['Toyota', 'BMW']));
    expect(body.models.Toyota).toEqual(expect.arrayContaining(['Corolla']));
    expect(body.locations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'madrid', label: 'Madrid' }),
    ]));
  });

  it('validates input before starting a search', async () => {
    const executeSearch = vi.fn();
    const app = await createApp({ executeSearch, logger: false, serveWeb: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: { brand: '', locationId: 'madrid', distanceMeters: 100 },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
    expect(executeSearch).not.toHaveBeenCalled();
  });

  it('returns the search result from the local pipeline adapter', async () => {
    const executeSearch = vi.fn().mockResolvedValue({
      captured: 5,
      matched: 2,
      displayed: 2,
      outputPath: 'output/raw-listings.json',
      items: [],
    });
    const app = await createApp({ executeSearch, logger: false, serveWeb: false });
    const response = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        brand: 'Toyota',
        model: 'Corolla',
        locationId: 'madrid',
        distanceMeters: 50_000,
        maxPages: 1,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ captured: 5, matched: 2 });
    expect(executeSearch).toHaveBeenCalledWith(expect.objectContaining({
      brand: 'Toyota',
      model: 'Corolla',
      maxPages: 1,
    }));
  });
});
