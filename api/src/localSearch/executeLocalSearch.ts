import path from 'node:path';

import pino from 'pino';

import { SEARCH_LOCATIONS, type SearchDefinition } from '../../../pipeline/src/config/searches.js';
import { createPrismaClient } from '../../../pipeline/src/db/client.js';
import { PrismaListingRepository } from '../../../pipeline/src/reconcile/PrismaListingRepository.js';
import { reconcileListings } from '../../../pipeline/src/reconcile/reconcileListings.js';
import type { ReconcileSummary } from '../../../pipeline/src/reconcile/types.js';
import {
  runSearchBatch,
  writeJsonAtomically,
  type BatchLogger,
  type SearchPageClient,
} from '../../../pipeline/src/search.js';
import { WallapopClient } from '../../../pipeline/src/wallapop/WallapopClient.js';
import { filterRawListings, toSearchResultItem } from './filterListings.js';
import type { LocalSearchRequest, LocalSearchResult } from './types.js';

const OUTPUT_PATH = path.resolve('output/raw-listings.json');
const RESULT_PREVIEW_LIMIT = 100;

export interface LocalSearchDependencies {
  client?: SearchPageClient;
  outputPath?: string;
  reconcile?: (rawItems: readonly unknown[]) => Promise<ReconcileSummary>;
}

export function createLocalWallapopClient(logger: BatchLogger): WallapopClient {
  return new WallapopClient({
    proxyUrl: process.env.WALLAPOP_PROXY_URL,
    timeoutMs: positiveEnv('WALLAPOP_TIMEOUT_MS', 30_000),
    minRequestIntervalMs: positiveEnv('WALLAPOP_MIN_INTERVAL_MS', 1_000),
    maxRetries: nonNegativeEnv('WALLAPOP_MAX_RETRIES', 4),
    onRetry: ({ attempt, delayMs, status, code }) => {
      logger.warn({ attempt, delayMs, status, code }, 'Retrying local UI search request');
    },
  });
}

export async function executeLocalSearch(
  request: LocalSearchRequest,
  logger: BatchLogger = pino({ level: process.env.LOG_LEVEL ?? 'info' }),
  dependencies: LocalSearchDependencies = {},
): Promise<LocalSearchResult> {
  const location = SEARCH_LOCATIONS.find(({ id }) => id === request.locationId);
  if (!location) {
    throw new Error(`Unknown location id: ${request.locationId}`);
  }

  const definition: SearchDefinition = {
    id: `ui-${request.brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${location.id}`,
    brand: request.brand,
    ...(request.model ? { model: request.model } : {}),
    ...(request.engine ? { engine: request.engine } : {}),
    ...(request.transmission ? { transmission: request.transmission } : {}),
    ...(request.bodyType ? { bodyType: request.bodyType } : {}),
    ...(request.price?.min !== undefined ? { priceMin: request.price.min } : {}),
    ...(request.price?.max !== undefined ? { priceMax: request.price.max } : {}),
    location: { ...location, distanceMeters: request.distanceMeters },
  };
  const client = dependencies.client ?? createLocalWallapopClient(logger);
  const outputPath = dependencies.outputPath ?? OUTPUT_PATH;

  const captured = await runSearchBatch({
    client,
    searches: [definition],
    ...(request.maxPages !== undefined ? { maxPages: request.maxPages } : {}),
    logger,
  });
  const matched = filterRawListings(captured, request);
  await writeJsonAtomically(outputPath, matched);
  const preview = matched.slice(0, RESULT_PREVIEW_LIMIT).map(toSearchResultItem);
  let reconciliation: LocalSearchResult['reconciliation'];

  try {
    const summary = await (dependencies.reconcile ?? reconcileWithPrisma)(matched);
    reconciliation = { status: 'completed', summary };
    logger.info({ ...summary }, 'Local UI listings reconciled');
  } catch (error) {
    logger.error(
      { errorType: error instanceof Error ? error.name : typeof error },
      'Local UI reconciliation failed after capture',
    );
    reconciliation = {
      status: 'failed',
      message: 'La captura se ha guardado, pero no se ha podido actualizar la base de datos.',
    };
  }

  return {
    captured: captured.length,
    matched: matched.length,
    displayed: preview.length,
    outputPath: path.relative(process.cwd(), outputPath),
    items: preview,
    reconciliation,
  };
}

async function reconcileWithPrisma(rawItems: readonly unknown[]): Promise<ReconcileSummary> {
  const prisma = createPrismaClient();
  try {
    return await reconcileListings({
      rawItems,
      repository: new PrismaListingRepository(prisma),
    });
  } finally {
    await prisma.$disconnect();
  }
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
