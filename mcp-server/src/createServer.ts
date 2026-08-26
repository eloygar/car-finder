import { McpServer } from '@modelcontextprotocol/server';
import type { Logger } from 'pino';

import { checkKnownIssues } from './tools/checkKnownIssues.js';
import { classifyVehicleOperability } from './tools/classifyVehicleOperability.js';
import { estimateMarketPrice } from './tools/estimateMarketPrice.js';
import {
  checkKnownIssuesOutputSchema,
  estimateMarketPriceOutputSchema,
  vehicleOperabilityOutputSchema,
  vehicleOperabilitySubmissionSchema,
  vehicleQuerySchema,
} from './tools/schemas.js';
import type { McpToolRepository } from './tools/types.js';

export interface CreateMcpServerOptions {
  repository: McpToolRepository;
  logger: Pick<Logger, 'error'>;
  enableLegacyTools?: boolean;
}

export function createMcpServer({
  repository,
  logger,
  enableLegacyTools = false,
}: CreateMcpServerOptions): McpServer {
  const server = new McpServer({ name: 'car-finder', version: '0.1.0' });

  server.registerTool(
    'classify_vehicle_operability',
    {
      title: 'Submit Vehicle Operability Classification',
      description: 'Validate and submit whether the vehicle can start and move under its own power, using only literal evidence from the seller description.',
      inputSchema: vehicleOperabilitySubmissionSchema,
      outputSchema: vehicleOperabilityOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (submission) => {
      try {
        return toolSuccess(classifyVehicleOperability(submission));
      } catch (error) {
        logToolFailure(logger, 'classify_vehicle_operability', error);
        return toolFailure('invalid_operability_classification', 'The evidence is not grounded in the supplied description.');
      }
    },
  );

  if (!enableLegacyTools) return server;

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

function toolFailure(
  error = 'database_error',
  message = 'The tool could not query its data.',
) {
  return {
    isError: true,
    content: [{
      type: 'text' as const,
      text: JSON.stringify({ error, message }),
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
