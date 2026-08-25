#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pino from 'pino';

import { createPrismaClient } from './db/client.js';
import { PrismaListingRepository } from './reconcile/PrismaListingRepository.js';
import { reconcileListings } from './reconcile/reconcileListings.js';
import type { ReconcileSummary, ReconciliationRepository } from './reconcile/types.js';

const DEFAULT_INPUT = 'output/raw-listings.json';

export interface ReconcileCliOptions {
  inputPath: string;
  dryRun: boolean;
}

export function parseReconcileCliArgs(
  args: readonly string[],
  cwd = process.cwd(),
): ReconcileCliOptions {
  let inputPath = path.resolve(cwd, DEFAULT_INPUT);
  let dryRun = false;
  const firstArgumentIndex = args[0] === '--' ? 1 : 0;

  for (let index = firstArgumentIndex; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') {
      throw new HelpRequested();
    }
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument !== '--input') {
      throw new Error(`Unknown argument: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error('Missing value for --input');
    }
    inputPath = path.resolve(cwd, value);
    index += 1;
  }

  return { inputPath, dryRun };
}

export async function reconcileFile(options: {
  inputPath: string;
  repository: ReconciliationRepository;
  dryRun?: boolean;
  seenAt?: Date;
}): Promise<ReconcileSummary> {
  const contents = await readFile(options.inputPath, 'utf8');
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Invalid JSON in ${options.inputPath}`, { cause: error });
  }

  return reconcileListings({
    rawItems,
    repository: options.repository,
    dryRun: options.dryRun,
    seenAt: options.seenAt,
  });
}

async function main(): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  let prisma: ReturnType<typeof createPrismaClient> | undefined;

  try {
    const cliOptions = parseReconcileCliArgs(process.argv.slice(2));
    prisma = createPrismaClient();
    const summary = await reconcileFile({
      inputPath: cliOptions.inputPath,
      repository: new PrismaListingRepository(prisma),
      dryRun: cliOptions.dryRun,
    });
    logger.info(summary, 'Wallapop reconciliation completed');
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    logger.error({ err: error }, 'Wallapop reconciliation failed');
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}

function usage(): string {
  return [
    'Usage: pnpm pipeline:reconcile -- [options]',
    '',
    'Options:',
    '  --input <path>  Raw listing array (default: output/raw-listings.json)',
    '  --dry-run       Compare with the database without writing changes',
    '  --help          Show this help',
  ].join('\n');
}

class HelpRequested extends Error {}

const isEntryPoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isEntryPoint) {
  await main();
}
