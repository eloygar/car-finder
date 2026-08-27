import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import Anthropic from '@anthropic-ai/sdk';

import { createPrismaClient } from '../../shared/src/db/client.js';
import {
  AnthropicVehicleAnalysisService,
  DEFAULT_KNOWN_ISSUES_WEB_MODEL,
  DEFAULT_OPERATIONAL_STATUS_MODEL,
  DEFAULT_ISSUE_ASSESSMENT_MODEL,
} from './anthropic/AnthropicVehicleAnalysisService.js';
import { createMcpServer } from './createServer.js';
import { PrismaMcpToolRepository } from './db/PrismaMcpToolRepository.js';
import { createMcpLogger } from './logger.js';

async function main(): Promise<void> {
  const logger = createMcpLogger();
  const enableLegacyTools = process.env.MCP_ENABLE_LEGACY_TOOLS === 'true';
  const prisma = enableLegacyTools ? createPrismaClient() : undefined;
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY ?? 'missing-anthropic-api-key',
    maxRetries: 3,
    timeout: 120_000,
  });
  const server = createMcpServer({
    analysisService: new AnthropicVehicleAnalysisService(
      { create: (params) => anthropic.messages.create(params) },
      process.env.OPERATIONAL_STATUS_MODEL ?? DEFAULT_OPERATIONAL_STATUS_MODEL,
      process.env.KNOWN_ISSUES_WEB_MODEL ?? DEFAULT_KNOWN_ISSUES_WEB_MODEL,
      process.env.ISSUE_ASSESSMENT_MODEL ?? DEFAULT_ISSUE_ASSESSMENT_MODEL,
    ),
    ...(prisma ? { repository: new PrismaMcpToolRepository(prisma) } : {}),
    logger,
    enableLegacyTools,
  });
  const transport = new StdioServerTransport();
  let closing = false;

  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close().catch(() => undefined);
    await prisma?.$disconnect().catch(() => undefined);
  };

  process.once('SIGINT', () => void close());
  process.once('SIGTERM', () => void close());

  try {
    await server.connect(transport);
  } catch (error) {
    logger.error(
      { errorType: error instanceof Error ? error.name : typeof error },
      'MCP server failed',
    );
    await close();
    process.exitCode = 1;
  }
}

void main();
