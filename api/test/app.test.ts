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
      expect.objectContaining({ id: 'alicante', label: 'Alicante' }),
      expect.objectContaining({ id: 'malaga', label: 'Málaga' }),
      expect.objectContaining({ id: 'palma', label: 'Palma' }),
      expect.objectContaining({ id: 'las-palmas', label: 'Las Palmas de Gran Canaria' }),
    ]));
    expect(body.locations).toHaveLength(52);
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
      reconciliation: {
        status: 'completed',
        summary: {
          total: 2,
          created: 1,
          changed: 0,
          unchanged: 1,
          reactivated: 0,
          dryRun: false,
        },
      },
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
    expect(response.json()).toMatchObject({
      captured: 5,
      matched: 2,
      reconciliation: { status: 'completed', summary: { created: 1 } },
    });
    expect(executeSearch).toHaveBeenCalledWith(expect.objectContaining({
      brand: 'Toyota',
      model: 'Corolla',
      maxPages: 1,
    }));
  });

  it('returns a safe actionable error when Wallapop rate limits the search', async () => {
    const upstreamError = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { status: 429 },
    });
    const app = await createApp({
      executeSearch: vi.fn().mockRejectedValue(upstreamError),
      logger: false,
      serveWeb: false,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/search',
      payload: {
        brand: 'Toyota',
        locationId: 'madrid',
        distanceMeters: 50_000,
        maxPages: 1,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: 'wallapop_rate_limited',
      message: 'Wallapop ha limitado temporalmente las peticiones. Espera un momento y vuelve a intentarlo.',
    });
  });
});
