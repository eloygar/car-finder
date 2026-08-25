import { McpServer } from '@modelcontextprotocol/server';
import type { Logger } from 'pino';

import { checkKnownIssues } from './tools/checkKnownIssues.js';
import { estimateMarketPrice } from './tools/estimateMarketPrice.js';
import {
  checkKnownIssuesOutputSchema,
  estimateMarketPriceOutputSchema,
  vehicleQuerySchema,
} from './tools/schemas.js';
import type { McpToolRepository } from './tools/types.js';

export interface CreateMcpServerOptions {
  repository: McpToolRepository;
  logger: Pick<Logger, 'error'>;
}

export function createMcpServer({ repository, logger }: CreateMcpServerOptions): McpServer {
  const server = new McpServer({ name: 'car-finder', version: '0.1.0' });

  server.registerTool(
    'check_known_issues',
    {
      title: 'Check Known Vehicle Issues',
      description: 'Find documented known issues for a vehicle model and optional model year.',
      inputSchema: vehicleQuerySchema,
      outputSchema: checkKnownIssuesOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (query) => {
      try {
        const result = await checkKnownIssues(query, repository);
        return toolSuccess(result);
      } catch (error) {
        logToolFailure(logger, 'check_known_issues', error);
        return toolFailure();
      }
    },
  );

  server.registerTool(
    'estimate_market_price',
    {
      title: 'Estimate Market Price',
      description: 'Calculate price statistics from active comparable listings in the database.',
      inputSchema: vehicleQuerySchema,
      outputSchema: estimateMarketPriceOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (query) => {
      try {
        const result = await estimateMarketPrice(query, repository);
        return toolSuccess(result);
      } catch (error) {
        logToolFailure(logger, 'estimate_market_price', error);
        return toolFailure();
      }
    },
  );

  return server;
}

function toolSuccess(result: object) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result as Record<string, unknown>,
  };
}

function toolFailure() {
  return {
    isError: true,
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ error: 'database_error', message: 'The tool could not query its data.' }),
    }],
  };
}

function logToolFailure(
  logger: Pick<Logger, 'error'>,
  tool: string,
  error: unknown,
): void {
  logger.error(
    { tool, errorType: error instanceof Error ? error.name : typeof error },
    'MCP tool execution failed',
  );
}
