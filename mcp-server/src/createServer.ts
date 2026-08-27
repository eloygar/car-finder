import { McpServer } from '@modelcontextprotocol/server';
import type { Logger } from 'pino';

import { checkKnownIssues } from './tools/checkKnownIssues.js';
import { classifyVehicleOperability } from './tools/classifyVehicleOperability.js';
import { estimateMarketPrice } from './tools/estimateMarketPrice.js';
import {
  checkKnownIssuesOutputSchema,
  estimateMarketPriceOutputSchema,
  knownIssuesWebToolOutputSchema,
  knownIssuesWebQuerySchema,
  operationalStatusInputSchema,
  operationalStatusToolOutputSchema,
  vehicleOperabilityOutputSchema,
  vehicleOperabilitySubmissionSchema,
  vehicleQuerySchema,
} from './tools/schemas.js';
import type { McpToolRepository, VehicleAnalysisService } from './tools/types.js';

export interface CreateMcpServerOptions {
  analysisService: VehicleAnalysisService;
  repository?: McpToolRepository;
  logger: Pick<Logger, 'error'>;
  enableLegacyTools?: boolean;
}

export function createMcpServer({
  analysisService,
  repository,
  logger,
  enableLegacyTools = false,
}: CreateMcpServerOptions): McpServer {
  const server = new McpServer({ name: 'car-finder', version: '0.1.0' });

  server.registerTool(
    'check_operational_status',
    {
      title: 'Check Vehicle Operational Status',
      description: 'Use Claude Sonnet 5 without tools to determine from the seller description whether the vehicle can start and move under its own power.',
      inputSchema: operationalStatusInputSchema,
      outputSchema: operationalStatusToolOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async ({ description }) => {
      try {
        return toolSuccess(await analysisService.checkOperationalStatus(description));
      } catch (error) {
        logToolFailure(logger, 'check_operational_status', error);
        return toolFailure('operational_status_failed', 'The vehicle operational status could not be determined.');
      }
    },
  );

  server.registerTool(
    'check_known_issues_web',
    {
      title: 'Check Known Vehicle Issues on the Web',
      description: 'Use Claude Haiku 4.5 and native web search to categorize documented problems for one vehicle model-year.',
      inputSchema: knownIssuesWebQuerySchema,
      outputSchema: knownIssuesWebToolOutputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
    },
    async (query) => {
      try {
        return toolSuccess(await analysisService.checkKnownIssuesWeb(query));
      } catch (error) {
        logToolFailure(logger, 'check_known_issues_web', error);
        return toolFailure('known_issues_web_failed', 'Known vehicle issues could not be researched.');
      }
    },
  );

  if (!enableLegacyTools) return server;
  if (!repository) throw new Error('A repository is required when legacy MCP tools are enabled');

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
