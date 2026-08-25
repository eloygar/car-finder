#!/usr/bin/env node

import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pino from 'pino';

import { SEARCHES, type SearchDefinition } from './config/searches.js';
import { WallapopClient } from './wallapop/WallapopClient.js';
import type { RawWallapopItem, WallapopSearchParams } from './wallapop/types.js';

const DEFAULT_OUTPUT = 'output/raw-listings.json';
const CAR_CATEGORY_ID = 100;

export interface SearchPageClient {
  searchPage(params: WallapopSearchParams): Promise<{
    items: RawWallapopItem[];
    nextCursor?: string;
  }>;
}

export interface BatchLogger {
  info(bindings: Record<string, unknown>, message: string): void;
  warn(bindings: Record<string, unknown>, message: string): void;
  error(bindings: Record<string, unknown>, message: string): void;
}

export interface CliOptions {
  maxPages?: number;
  only?: string;
  outputPath: string;
}

export async function runSearchBatch(options: {
  client: SearchPageClient;
  searches: readonly SearchDefinition[];
  maxPages?: number;
  logger: BatchLogger;
}): Promise<RawWallapopItem[]> {
  const uniqueItems = new Map<string, RawWallapopItem>();

  for (const search of options.searches) {
    let nextPage: string | undefined;
    const observedCursors = new Set<string>();

    for (let pageNumber = 1; ; pageNumber += 1) {
      const page = await options.client.searchPage({
        brand: search.brand,
        ...(search.engine ? { engine: search.engine } : {}),
        categoryId: CAR_CATEGORY_ID,
        latitude: search.location.latitude,
        longitude: search.location.longitude,
        distance: search.location.distanceMeters,
        ...(nextPage ? { nextPage } : {}),
      });

      for (const item of page.items) {
        if (!uniqueItems.has(item.id)) {
          uniqueItems.set(item.id, item);
        }
      }

      options.logger.info(
        {
          searchId: search.id,
          page: pageNumber,
          pageItems: page.items.length,
          uniqueItems: uniqueItems.size,
        },
        'Wallapop search page received',
      );

      if (page.items.length === 0 || !page.nextCursor) {
        break;
      }

      if (observedCursors.has(page.nextCursor)) {
        throw new Error(`Wallapop returned a repeated cursor for search "${search.id}"`);
      }
      observedCursors.add(page.nextCursor);

      if (options.maxPages !== undefined && pageNumber >= options.maxPages) {
        options.logger.info(
          { searchId: search.id, maxPages: options.maxPages },
          'Configured page limit reached',
        );
        break;
      }

      nextPage = page.nextCursor;
    }
  }

  return [...uniqueItems.values()];
}

export function parseCliArgs(args: readonly string[], cwd = process.cwd()): CliOptions {
  let maxPages: number | undefined;
  let only: string | undefined;
  let outputPath = path.resolve(cwd, DEFAULT_OUTPUT);
  const firstArgumentIndex = args[0] === '--' ? 1 : 0;

  for (let index = firstArgumentIndex; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') {
      throw new HelpRequested();
    }

    if (argument !== '--max-pages' && argument !== '--only' && argument !== '--output') {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}`);
    }
    index += 1;

    if (argument === '--max-pages') {
      maxPages = parsePositiveInteger(value, '--max-pages');
    } else if (argument === '--only') {
      only = value;
    } else {
      outputPath = path.resolve(cwd, value);
    }
  }

  return {
    outputPath,
    ...(maxPages !== undefined ? { maxPages } : {}),
    ...(only ? { only } : {}),
  };
}

export async function writeJsonAtomically(
  outputPath: string,
  items: readonly RawWallapopItem[],
): Promise<void> {
  const directory = path.dirname(outputPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.${Date.now()}.tmp`,
  );

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

  try {
    const cliOptions = parseCliArgs(process.argv.slice(2));
    const searches = selectSearches(SEARCHES, cliOptions.only);
    const client = new WallapopClient({
      proxyUrl: process.env.WALLAPOP_PROXY_URL,
      timeoutMs: readPositiveIntegerEnv('WALLAPOP_TIMEOUT_MS', 30_000),
      minRequestIntervalMs: readPositiveIntegerEnv('WALLAPOP_MIN_INTERVAL_MS', 1_000),
      maxRetries: readNonNegativeIntegerEnv('WALLAPOP_MAX_RETRIES', 4),
      onRetry: ({ attempt, delayMs, status, code }) => {
        logger.warn(
          { attempt, delayMs, status, code },
          'Retrying Wallapop request',
        );
      },
    });

    const items = await runSearchBatch({
      client,
      searches,
      ...(cliOptions.maxPages !== undefined ? { maxPages: cliOptions.maxPages } : {}),
      logger,
    });
    await writeJsonAtomically(cliOptions.outputPath, items);
    logger.info(
      { searches: searches.length, items: items.length, outputPath: cliOptions.outputPath },
      'Wallapop search batch completed',
    );
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    logger.error({ err: error }, 'Wallapop search batch failed');
    process.exitCode = 1;
  }
}

function selectSearches(
  searches: readonly SearchDefinition[],
  only?: string,
): readonly SearchDefinition[] {
  if (!only) {
    return searches;
  }
  const selected = searches.find((search) => search.id === only);
  if (!selected) {
    throw new Error(
      `Unknown search id "${only}". Available ids: ${searches.map((search) => search.id).join(', ')}`,
    );
  }
  return [selected];
}

function parsePositiveInteger(value: string, label: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return number;
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  return value === undefined ? fallback : parsePositiveInteger(value, name);
}

function readNonNegativeIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return number;
}

function usage(): string {
  return [
    'Usage: pnpm pipeline:search -- [options]',
    '',
    'Options:',
    '  --max-pages <n>    Optional page cap; default is all pages until cursor exhaustion',
    '  --only <search-id> Run one configured search',
    '  --output <path>    Output JSON path (default: output/raw-listings.json)',
    '  --help             Show this help',
  ].join('\n');
}

class HelpRequested extends Error {}

const isEntryPoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isEntryPoint) {
  await main();
}
