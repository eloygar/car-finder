import path from 'node:path';

import pino from 'pino';

import { SEARCH_LOCATIONS, type SearchDefinition } from '../../../pipeline/src/config/searches.js';
import {
  runSearchBatch,
  writeJsonAtomically,
  type BatchLogger,
} from '../../../pipeline/src/search.js';
import { WallapopClient } from '../../../pipeline/src/wallapop/WallapopClient.js';
import { filterRawListings, toSearchResultItem } from './filterListings.js';
import type { LocalSearchRequest, LocalSearchResult } from './types.js';

const OUTPUT_PATH = path.resolve('output/raw-listings.json');
const RESULT_PREVIEW_LIMIT = 100;

export async function executeLocalSearch(
  request: LocalSearchRequest,
  logger: BatchLogger = pino({ level: process.env.LOG_LEVEL ?? 'info' }),
): Promise<LocalSearchResult> {
  const location = SEARCH_LOCATIONS.find(({ id }) => id === request.locationId);
  if (!location) {
    throw new Error(`Unknown location id: ${request.locationId}`);
  }

  const definition: SearchDefinition = {
    id: `ui-${request.brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${location.id}`,
    brand: request.brand,
    ...(request.engine ? { engine: request.engine } : {}),
    location: { ...location, distanceMeters: request.distanceMeters },
  };
  const client = new WallapopClient({
    proxyUrl: process.env.WALLAPOP_PROXY_URL,
    timeoutMs: positiveEnv('WALLAPOP_TIMEOUT_MS', 30_000),
    minRequestIntervalMs: positiveEnv('WALLAPOP_MIN_INTERVAL_MS', 1_000),
    maxRetries: nonNegativeEnv('WALLAPOP_MAX_RETRIES', 4),
    onRetry: ({ attempt, delayMs, status, code }) => {
      logger.warn({ attempt, delayMs, status, code }, 'Retrying local UI search request');
    },
  });

  const captured = await runSearchBatch({
    client,
    searches: [definition],
    ...(request.maxPages !== undefined ? { maxPages: request.maxPages } : {}),
    logger,
  });
  const matched = filterRawListings(captured, request);
  await writeJsonAtomically(OUTPUT_PATH, matched);
  const preview = matched.slice(0, RESULT_PREVIEW_LIMIT).map(toSearchResultItem);

  return {
    captured: captured.length,
    matched: matched.length,
    displayed: preview.length,
    outputPath: path.relative(process.cwd(), OUTPUT_PATH),
    items: preview,
  };
}

function positiveEnv(name: string, fallback: number): number {
  const value = process.env[name];
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be positive`);
  return parsed;
}

function nonNegativeEnv(name: string, fallback: number): number {
  const value = process.env[name];
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`${name} must not be negative`);
  return parsed;
}
