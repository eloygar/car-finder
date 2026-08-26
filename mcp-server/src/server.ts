import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

import { createPrismaClient } from '../../shared/src/db/client.js';
import { createMcpServer } from './createServer.js';
import { PrismaMcpToolRepository } from './db/PrismaMcpToolRepository.js';
import { createMcpLogger } from './logger.js';

async function main(): Promise<void> {
  const logger = createMcpLogger();
  const prisma = createPrismaClient();
  const server = createMcpServer({
    repository: new PrismaMcpToolRepository(prisma),
    logger,
    enableLegacyTools: process.env.MCP_ENABLE_LEGACY_TOOLS === 'true',
  });
  const transport = new StdioServerTransport();
  let closing = false;

  const close = async () => {
    if (closing) return;
    closing = true;
    await server.close().catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
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
