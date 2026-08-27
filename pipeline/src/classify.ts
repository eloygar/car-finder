#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import pino from 'pino';

import { createPrismaClient } from './db/client.js';
import { PrismaClassificationRepository } from './classify/PrismaClassificationRepository.js';
import { createClassifierSession } from './classify/createClassifierSession.js';
import { runClassification } from './classify/runClassification.js';
import { createClassificationTerminalReporter } from './classify/terminalReporter.js';
import type { ClassificationRunOptions } from './classify/types.js';
import {
  DEFAULT_KNOWN_ISSUES_WEB_MODEL,
  DEFAULT_ISSUE_ASSESSMENT_MODEL,
  DEFAULT_OPERATIONAL_STATUS_MODEL,
  DEFAULT_LISTING_ISSUE_EXTRACTION_MODEL,
} from '../../mcp-server/src/anthropic/AnthropicVehicleAnalysisService.js';
import {
  listingIssueAssessmentsEnabled,
  modelIssueAssessmentsEnabled,
} from '../../shared/src/featureFlags.js';

export function parseClassificationArgs(args: readonly string[]): ClassificationRunOptions {
  let all = false;
  let dryRun = false;
  let force = false;
  let refreshKnownIssues = false;
  let explicitLimit: number | undefined;
  let only: string | undefined;
  const start = args[0] === '--' ? 1 : 0;

  for (let index = start; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') throw new HelpRequested();
    if (argument === '--all') {
      all = true;
      continue;
    }
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument === '--force') {
      force = true;
      continue;
    }
    if (argument === '--refresh-known-issues') {
      refreshKnownIssues = true;
      continue;
    }
    if (argument !== '--limit' && argument !== '--only') {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    index += 1;
    if (argument === '--limit') explicitLimit = positiveInteger(value, '--limit');
    else only = value.trim();
  }

  if (all && explicitLimit !== undefined) throw new Error('--all cannot be combined with --limit');
  if (all && only) throw new Error('--all cannot be combined with --only');
  if (only && explicitLimit !== undefined) throw new Error('--only cannot be combined with --limit');
  return {
    all,
    dryRun,
    force,
    refreshKnownIssues,
    ...(!all && !only ? { limit: explicitLimit ?? 10 } : {}),
    ...(only ? { only } : {}),
  };
}

async function main(): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const progress = createClassificationTerminalReporter({
    enabled: terminalProgressEnabled(),
    colors: terminalColorsEnabled(),
    write: (text) => process.stderr.write(text),
  });
  let prisma: ReturnType<typeof createPrismaClient> | undefined;
  try {
    const run = parseClassificationArgs(process.argv.slice(2));
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!run.dryRun && !apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for live classification');
    }
    const operationalStatusModel = process.env.OPERATIONAL_STATUS_MODEL ?? DEFAULT_OPERATIONAL_STATUS_MODEL;
    const knownIssuesWebModel = process.env.KNOWN_ISSUES_WEB_MODEL ?? DEFAULT_KNOWN_ISSUES_WEB_MODEL;
    const issueAssessmentModel = process.env.ISSUE_ASSESSMENT_MODEL ?? DEFAULT_ISSUE_ASSESSMENT_MODEL;
    const listingIssueExtractionModel = process.env.LISTING_ISSUE_EXTRACTION_MODEL ?? DEFAULT_LISTING_ISSUE_EXTRACTION_MODEL;
    prisma = createPrismaClient();
    const listingAssessmentsEnabled = listingIssueAssessmentsEnabled();
    const summary = await runClassification({
      run,
      repository: new PrismaClassificationRepository(prisma, {
        listingIssueAssessments: listingAssessmentsEnabled,
      }),
      logger,
      modelIssueAssessmentsEnabled: modelIssueAssessmentsEnabled(),
      listingIssueAssessmentsEnabled: listingAssessmentsEnabled,
      onProgress: progress.onProgress,
      ...(!run.dryRun ? {
        createSession: () => createClassifierSession({ logger }),
      } : {}),
    });
    logger.info({
      ...summary,
      operationalStatusModel: run.dryRun ? undefined : operationalStatusModel,
      knownIssuesWebModel: run.dryRun ? undefined : knownIssuesWebModel,
      issueAssessmentModel: run.dryRun ? undefined : issueAssessmentModel,
      listingIssueExtractionModel: run.dryRun ? undefined : listingIssueExtractionModel,
    }, 'Classification run completed');
    progress.complete(summary);
    if (summary.failed > 0 || summary.assessmentFailed > 0 || summary.listingAssessmentFailed > 0) process.exitCode = 1;
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    logger.error({ errorType: error instanceof Error ? error.name : typeof error }, 'Classification run failed');
    progress.fatal(`La clasificación no pudo iniciarse: ${error instanceof Error ? error.message : 'error desconocido'}`);
    process.exitCode = 1;
  } finally {
    await prisma?.$disconnect();
  }
}

function terminalProgressEnabled(): boolean {
  if (process.env.CLASSIFY_PROGRESS === 'never') return false;
  return process.env.CLASSIFY_PROGRESS === 'always' || process.stderr.isTTY === true;
}

function terminalColorsEnabled(): boolean {
  if (process.env.FORCE_COLOR !== undefined) return true;
  if (process.env.NO_COLOR !== undefined) return false;
  return process.stderr.isTTY === true;
}

function positiveInteger(value: string, option: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${option} must be positive`);
  return parsed;
}

function usage(): string {
  return [
    'Usage: pnpm pipeline:classify -- [options]',
    '',
    'Options:',
    '  --limit <n>         Maximum pending listings (default: 10)',
    '  --all               Process every pending or outdated active listing',
    '  --only <externalId> Process one listing by external ID',
    '  --dry-run           Select and summarize without MCP or Anthropic calls',
    '  --force             Include listings already classified with the current version',
    '  --refresh-known-issues  Ignore cached model-year web research',
    '  --help              Show this help',
  ].join('\n');
}

export class HelpRequested extends Error {}

const isEntryPoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (isEntryPoint) await main();
