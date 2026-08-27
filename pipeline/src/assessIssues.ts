#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pino from 'pino';
import { createPrismaClient } from './db/client.js';
import { createClassifierSession } from './classify/createClassifierSession.js';
import { PrismaIssueAssessmentRepository } from './assessIssues/PrismaIssueAssessmentRepository.js';
import { runAssessIssues } from './assessIssues/runAssessIssues.js';
import type { AssessIssuesRunOptions } from './assessIssues/types.js';
import { modelIssueAssessmentsEnabled } from '../../shared/src/featureFlags.js';

export function parseAssessIssuesArgs(args: readonly string[]): AssessIssuesRunOptions {
  let all = false;
  let dryRun = false;
  let force = false;
  let limit: number | undefined;
  const start = args[0] === '--' ? 1 : 0;
  for (let index = start; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') throw new HelpRequested();
    if (argument === '--all') { all = true; continue; }
    if (argument === '--dry-run') { dryRun = true; continue; }
    if (argument === '--force') { force = true; continue; }
    if (argument !== '--limit') throw new Error(`Unknown argument: ${argument}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing value for --limit');
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('--limit must be positive');
    limit = parsed;
    index += 1;
  }
  if (all && limit !== undefined) throw new Error('--all cannot be combined with --limit');
  return { all, dryRun, force, ...(!all ? { limit: limit ?? 20 } : {}) };
}

async function main(): Promise<void> {
  const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
  const prisma = createPrismaClient();
  try {
    const run = parseAssessIssuesArgs(process.argv.slice(2));
    if (!run.dryRun && !modelIssueAssessmentsEnabled()) {
      logger.info({ feature: 'ENABLE_MODEL_ISSUE_ASSESSMENTS' }, 'Model issue assessments are disabled');
      return;
    }
    if (!run.dryRun && !process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is required');
    const summary = await runAssessIssues({
      run, repository: new PrismaIssueAssessmentRepository(prisma), logger,
      ...(!run.dryRun ? { createSession: () => createClassifierSession({ logger }) } : {}),
    });
    logger.info(summary, 'Issue assessment run completed');
    if (summary.assessmentFailed > 0) process.exitCode = 1;
  } catch (error) {
    if (error instanceof HelpRequested) {
      process.stdout.write(`${usage()}\n`);
      return;
    }
    logger.error({ errorType: error instanceof Error ? error.name : typeof error }, 'Issue assessment run failed');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

function usage(): string {
  return [
    'Usage: pnpm pipeline:assess-issues -- [options]', '',
    '  --limit <n>  Maximum assessments (default: 20)',
    '  --all        Process every pending assessment',
    '  --dry-run    Select without MCP or Anthropic calls',
    '  --force      Include cached assessments, oldest first',
    '  --help       Show this help',
  ].join('\n');
}

export class HelpRequested extends Error {}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
