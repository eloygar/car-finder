import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
} from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';

import type {
  RawWallapopItem,
  WallapopSearchPage,
  WallapopSearchParams,
} from './types.js';

const API_BASE_URL = 'https://api.wallapop.com/api/v3';
const SEARCH_PATH = '/search';

export interface RetryEvent {
  attempt: number;
  delayMs: number;
  status?: number;
  code?: string;
}

export interface WallapopClientOptions {
  proxyUrl?: string;
  timeoutMs?: number;
  minRequestIntervalMs?: number;
  maxRetries?: number;
  baseUrl?: string;
  httpClient?: AxiosInstance;
  sleep?: (delayMs: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  onRetry?: (event: RetryEvent) => void;
}

export function buildWallapopHeaders(): Record<string, string> {
  return {
    Host: 'api.wallapop.com',
    'X-DeviceOS': '0',
  };
}

export function createWallapopHttpClient(options: {
  baseUrl?: string;
  proxyUrl?: string;
  timeoutMs: number;
}): AxiosInstance {
  const config: AxiosRequestConfig = {
    baseURL: options.baseUrl ?? API_BASE_URL,
    timeout: options.timeoutMs,
    headers: {
      ...buildWallapopHeaders(),
      Accept: undefined,
      'User-Agent': undefined,
    },
  };

  if (options.proxyUrl) {
    config.httpsAgent = new HttpsProxyAgent(options.proxyUrl);
    config.proxy = false;
  }

  const client = axios.create(config);
  client.interceptors.request.use((request) => {
    const allowedHeaders = new Set(['host', 'x-deviceos']);
    for (const header of Object.keys(request.headers)) {
      if (!allowedHeaders.has(header.toLowerCase())) {
        delete request.headers[header];
      }
    }
    return request;
  });

  return client;
}

export class WallapopClient {
  private readonly http: AxiosInstance;
  private readonly minRequestIntervalMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly onRetry?: (event: RetryEvent) => void;
  private lastRequestStartedAt: number | undefined;

  constructor(options: WallapopClientOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 30_000;
    this.http =
      options.httpClient ??
      createWallapopHttpClient({
        baseUrl: options.baseUrl,
        proxyUrl: options.proxyUrl,
        timeoutMs,
      });
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? 1_000;
    this.maxRetries = options.maxRetries ?? 4;
    this.sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.onRetry = options.onRetry;
  }

  async searchPage(params: WallapopSearchParams): Promise<WallapopSearchPage> {
    const query: Record<string, string | number> = {
      step: 1,
      source: 'keywords',
      category_id: params.categoryId,
      brand: params.brand,
      latitude: params.latitude,
      longitude: params.longitude,
      distance: params.distance,
    };

    if (params.model) query.model = params.model;
    if (params.engine) query.engine = params.engine;
    if (params.transmission) query.gearbox = params.transmission;
    if (params.bodyType) query.body_type = params.bodyType;
    if (params.priceMin !== undefined) query.min_sale_price = params.priceMin;
    if (params.priceMax !== undefined) query.max_sale_price = params.priceMax;

    if (params.nextPage) {
      query.next_page = params.nextPage;
    }

    return this.requestWithRetry(async () => {
      const response = await this.http.get<unknown>(SEARCH_PATH, { params: query });
      return parseSearchResponse(response.data);
    });
  }

  private async requestWithRetry<T>(request: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      await this.waitForRateLimit();

      try {
        return await request();
      } catch (error) {
        if (!isRetryable(error) || attempt >= this.maxRetries) {
          throw error;
        }

        const retryDelay = getRetryAfterMs(error, this.now());
        const exponentialDelay = 1_000 * 2 ** attempt + Math.floor(this.random() * 250);
        const delayMs = retryDelay ?? exponentialDelay;
        const axiosError = axios.isAxiosError(error) ? error : undefined;

        this.onRetry?.({
          attempt: attempt + 1,
          delayMs,
          status: axiosError?.response?.status,
          code: error instanceof MalformedWallapopResponseError
            ? 'MALFORMED_RESPONSE'
            : axiosError?.code,
        });
        await this.sleep(delayMs);
      }
    }
  }

  private async waitForRateLimit(): Promise<void> {
    if (this.lastRequestStartedAt !== undefined) {
      const waitMs = Math.max(
        0,
        this.lastRequestStartedAt + this.minRequestIntervalMs - this.now(),
      );
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }
    }
    this.lastRequestStartedAt = this.now();
  }
}

function parseSearchResponse(payload: unknown): WallapopSearchPage {
  if (!isRecord(payload)) {
    throw malformed('expected an object');
  }

  const data = payload.data;
  const section = isRecord(data) ? data.section : undefined;
  const sectionPayload = isRecord(section) ? section.payload : undefined;
  const items = isRecord(sectionPayload) ? sectionPayload.items : undefined;

  if (!Array.isArray(items)) {
    throw malformed('data.section.payload.items is not an array');
  }

  const validatedItems = items.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || item.id.length === 0) {
      throw malformed(`item ${index} has no string id`);
    }
    return item as RawWallapopItem;
  });

  const meta = payload.meta;
  const nextPage = isRecord(meta) ? meta.next_page : undefined;
  if (nextPage !== undefined && typeof nextPage !== 'string') {
    throw malformed('meta.next_page is not a string');
  }

  return {
    items: validatedItems,
    ...(nextPage ? { nextCursor: nextPage } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRetryable(error: unknown): boolean {
  if (error instanceof MalformedWallapopResponseError) {
    return true;
  }
  if (!axios.isAxiosError(error)) {
    return false;
  }
  if (!error.response) {
    return true;
  }
  const status = error.response.status;
  return status === 403 || status === 429 || status >= 500;
}

class MalformedWallapopResponseError extends Error {
  constructor(detail: string) {
    super(`Malformed Wallapop response: ${detail}`);
    this.name = 'MalformedWallapopResponseError';
  }
}

function malformed(detail: string): MalformedWallapopResponseError {
  return new MalformedWallapopResponseError(detail);
}

function getRetryAfterMs(error: unknown, nowMs: number): number | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }

  const value = error.response?.headers?.['retry-after'];
  const header = Array.isArray(value) ? value[0] : value;
  if (typeof header !== 'string' && typeof header !== 'number') {
    return undefined;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }

  const dateMs = Date.parse(String(header));
  return Number.isNaN(dateMs) ? undefined : Math.max(0, dateMs - nowMs);
}
