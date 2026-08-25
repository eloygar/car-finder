import { AxiosError, AxiosHeaders, type AxiosInstance, type AxiosResponse } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { describe, expect, it, vi } from 'vitest';

import {
  buildWallapopHeaders,
  createWallapopHttpClient,
  WallapopClient,
} from '../src/wallapop/WallapopClient.js';

function searchPayload(items: unknown[] = [], nextPage?: unknown): unknown {
  return {
    data: { section: { payload: { items } } },
    meta: nextPage === undefined ? {} : { next_page: nextPage },
  };
}

function mockHttp(...outcomes: Array<unknown | Error>): {
  http: AxiosInstance;
  get: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn();
  for (const outcome of outcomes) {
    if (outcome instanceof Error) {
      get.mockRejectedValueOnce(outcome);
    } else {
      get.mockResolvedValueOnce({ data: outcome });
    }
  }
  return { http: { get } as unknown as AxiosInstance, get };
}

function httpError(status?: number, retryAfter?: string): AxiosError {
  const response = status === undefined
    ? undefined
    : {
        status,
        statusText: String(status),
        data: {},
        headers: new AxiosHeaders(retryAfter ? { 'retry-after': retryAfter } : {}),
        config: { headers: new AxiosHeaders() },
      } as AxiosResponse;
  return new AxiosError('request failed', 'ERR_BAD_RESPONSE', undefined, undefined, response);
}

const params = {
  brand: 'Toyota',
  categoryId: 100,
  latitude: 40.4168,
  longitude: -3.7038,
  distance: 50_000,
};

describe('WallapopClient', () => {
  it('builds only the required Wallapop headers', () => {
    expect(buildWallapopHeaders()).toEqual({
      Host: 'api.wallapop.com',
      'X-DeviceOS': '0',
    });
  });

  it('configures timeout and an optional proxy agent', () => {
    const client = createWallapopHttpClient({
      timeoutMs: 12_345,
      proxyUrl: 'http://localhost:8080',
    });

    expect(client.defaults.timeout).toBe(12_345);
    expect(client.defaults.proxy).toBe(false);
    expect(client.defaults.httpsAgent).toBeInstanceOf(HttpsProxyAgent);
  });

  it('sends category, brand, geo, and compatibility parameters', async () => {
    const item = { id: 'car-1', title: 'Kept verbatim', extra: { nested: true } };
    const { http, get } = mockHttp(searchPayload([item], 'cursor-1'));
    const client = new WallapopClient({ httpClient: http, minRequestIntervalMs: 0 });

    const page = await client.searchPage(params);

    expect(get).toHaveBeenCalledWith('/search', {
      params: {
        step: 1,
        source: 'keywords',
        category_id: 100,
        brand: 'Toyota',
        latitude: 40.4168,
        longitude: -3.7038,
        distance: 50_000,
      },
    });
    expect(page).toEqual({ items: [item], nextCursor: 'cursor-1' });
    expect(page.items[0]).toBe(item);
  });

  it('retains the original filters when adding a pagination cursor', async () => {
    const { http, get } = mockHttp(searchPayload([]));
    const client = new WallapopClient({ httpClient: http, minRequestIntervalMs: 0 });

    await client.searchPage({ ...params, nextPage: 'opaque-token' });

    expect(get.mock.calls[0]?.[1]?.params).toEqual({
      step: 1,
      source: 'keywords',
      category_id: 100,
      brand: 'Toyota',
      latitude: 40.4168,
      longitude: -3.7038,
      distance: 50_000,
      next_page: 'opaque-token',
    });
  });

  it.each([
    {},
    { data: {} },
    { data: { section: { payload: { items: 'not-an-array' } } } },
    searchPayload([{ title: 'missing id' }]),
    searchPayload([{ id: 123 }]),
    searchPayload([{ id: 'ok' }], 123),
  ])('rejects malformed response payload %#', async (payload) => {
    const { http } = mockHttp(payload);
    const client = new WallapopClient({ httpClient: http, minRequestIntervalMs: 0 });

    await expect(client.searchPage(params)).rejects.toThrow('Malformed Wallapop response');
  });

  it('honours Retry-After before retrying an eligible response', async () => {
    const { http, get } = mockHttp(httpError(429, '2'), searchPayload([{ id: 'car-1' }]));
    const sleeps: number[] = [];
    const retries = vi.fn();
    let clock = 0;
    const client = new WallapopClient({
      httpClient: http,
      minRequestIntervalMs: 1_000,
      now: () => clock,
      sleep: async (delay) => {
        sleeps.push(delay);
        clock += delay;
      },
      onRetry: retries,
    });

    await client.searchPage(params);

    expect(get).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([2_000]);
    expect(retries).toHaveBeenCalledWith({
      attempt: 1,
      delayMs: 2_000,
      status: 429,
      code: 'ERR_BAD_RESPONSE',
    });
  });

  it.each([403, 500, 503])('retries HTTP %s with exponential backoff', async (status) => {
    const { http, get } = mockHttp(httpError(status), searchPayload([]));
    const sleeps: number[] = [];
    let clock = 0;
    const client = new WallapopClient({
      httpClient: http,
      now: () => clock,
      random: () => 0,
      sleep: async (delay) => {
        sleeps.push(delay);
        clock += delay;
      },
    });

    await client.searchPage(params);

    expect(get).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([1_000]);
  });

  it('retries network failures without a response', async () => {
    const { http, get } = mockHttp(httpError(), searchPayload([]));
    let clock = 0;
    const client = new WallapopClient({
      httpClient: http,
      now: () => clock,
      random: () => 0,
      sleep: async (delay) => {
        clock += delay;
      },
    });

    await client.searchPage(params);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-eligible 4xx failures', async () => {
    const error = httpError(400);
    const { http, get } = mockHttp(error);
    const client = new WallapopClient({ httpClient: http, minRequestIntervalMs: 0 });

    await expect(client.searchPage(params)).rejects.toBe(error);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('stops after the configured retry limit', async () => {
    const lastError = httpError(503);
    const { http, get } = mockHttp(httpError(503), httpError(503), lastError);
    let clock = 0;
    const client = new WallapopClient({
      httpClient: http,
      maxRetries: 2,
      now: () => clock,
      random: () => 0,
      sleep: async (delay) => {
        clock += delay;
      },
    });

    await expect(client.searchPage(params)).rejects.toBe(lastError);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('enforces the minimum interval between successful requests', async () => {
    const { http } = mockHttp(searchPayload([]), searchPayload([]));
    const sleeps: number[] = [];
    let clock = 0;
    const client = new WallapopClient({
      httpClient: http,
      minRequestIntervalMs: 1_000,
      now: () => clock,
      sleep: async (delay) => {
        sleeps.push(delay);
        clock += delay;
      },
    });

    await client.searchPage(params);
    await client.searchPage(params);

    expect(sleeps).toEqual([1_000]);
  });
});
