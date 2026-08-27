#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pino from 'pino';
import Anthropic from '@anthropic-ai/sdk';

import { createPrismaClient } from './db/client.js';
import { PrismaKnownIssuesStore } from '../../mcp-server/src/db/PrismaKnownIssuesStore.js';
import {
  AnthropicVehicleAnalysisService,
  DEFAULT_KNOWN_ISSUES_WEB_MODEL,
} from '../../mcp-server/src/anthropic/AnthropicVehicleAnalysisService.js';
import type { VehicleQuery } from '../../mcp-server/src/tools/types.js';

const DEFAULT_OUTPUT_LIMIT = 25;

export interface ResearchKnownIssuesOptions {
  only?: string;
  force: boolean;
  limit: number;
}

export function parseResearchArgs(args: readonly string[]): ResearchKnownIssuesOptions {
  let only: string | undefined;
  let force = false;
  let limit = DEFAULT_OUTPUT_LIMIT;
  const start = args[0] === '--' ? 1 : 0;

  for (let index = start; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') throw new HelpRequested();
    if (argument === '--force') {
      force = true;
      continue;
    }
    if (argument !== '--only' && argument !== '--limit') {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    index += 1;
    if (argument === '--only') only = value.trim();
    else limit = positiveInteger(value, '--limit');
  }

  return { only, force, limit };
}

export interface ResearchSummary {
  scanned: number;
  researched: number;
  skipped: number;
  created: number;
  updated: number;
  failed: number;
}

export async function runResearchKnownIssues(options: {
  run: ResearchKnownIssuesOptions;
  store: PrismaKnownIssuesStore;
  service: AnthropicVehicleAnalysisService;
  models: Array<{ brand: string; name: string }>;
  logger: { info: (b: Record<string, unknown>, m: string) => void; error: (b: Record<string, unknown>, m: string) => void };
}): Promise<ResearchSummary> {
  const summary: ResearchSummary = {
    scanned: 0,
    researched: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    failed: 0,
  };

  for (const { brand, name } of options.models) {
    const query: VehicleQuery = { brand, model: name };
    summary.scanned += 1;

    if (!options.run.force) {
      const cached = await options.store.findByModel(query);
      if (cached) {
        summary.skipped += 1;
        continue;
      }
    }

    try {
      const result = await options.service.checkKnownIssuesWeb(query);
      const saved = await options.store.saveResearchedIssues(query, result.knownIssues.issues ?? []);
      summary.researched += 1;
      summary.created += saved.created;
      summary.updated += saved.updated;
      options.logger.info(
        { brand, model: name, found: result.knownIssues.found, created: saved.created, updated: saved.updated },
        'Researched known issues for model',
      );
    } catch (error) {
      summary.failed += 1;
      options.logger.error(
        { brand, model: name, errorType: error instanceof Error ? error.name : typeof error },
        'Known-issue research failed for model',
      );
    }
  }

  return summary;
}

async function main(): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  let prisma: ReturnType<typeof createPrismaClient> | undefined;

  try {
    const run = parseResearchArgs(process.argv.slice(2));
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

    prisma = createPrismaClient();
    const store = new PrismaKnownIssuesStore(prisma);
    const anthropic = new Anthropic({
      apiKey,
      maxRetries: 3,
      timeout: 120_000,
    });
    const service = new AnthropicVehicleAnalysisService(
      { create: (params) => anthropic.messages.create(params) },
      process.env.KNOWN_ISSUES_WEB_MODEL ?? DEFAULT_KNOWN_ISSUES_WEB_MODEL,
    );

    const where = run.only
      ? {
        brand: run.only.split('|')[0]!.trim(),
        name: run.only.split('|')[1]!.trim(),
      }
      : undefined;
    const models = await prisma.vehicleModel.findMany({
      where,
      select: { brand: true, name: true },
      orderBy: [{ brand: 'asc' }, { name: 'asc' }],
      take: run.limit,
    });

    const summary = await runResearchKnownIssues({
      run,
      store,
      service,
      models,
      logger: {
        info: (bindings, message) => logger.info(bindings, message),
        error: (bindings, message) => logger.error(bindings, message),
      },
    });
    logger.info(summary, 'Known-issue research completed');
    if (summary.failed > 0) process.exitCode = 1;
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    logger.error({ errorType: error instanceof Error ? error.name : typeof error }, 'Known-issue research failed');
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${option} must be positive`);
  return parsed;
}

function usage(): string {
  return [
    'Usage: pnpm pipeline:research-known-issues -- [options]',
    '',
    'Options:',
    '  --only <Brand|Model>  Research a single model (e.g. "Toyota|Corolla")',
    '  --limit <n>           Maximum models to process (default: 25)',
    '  --force               Re-research even models that already have stored issues',
    '  --help                Show this help',
  ].join('\n');
}

class HelpRequested extends Error {}

const isEntryPoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (isEntryPoint) void main();
