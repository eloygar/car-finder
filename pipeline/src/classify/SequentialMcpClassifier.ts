import {
  parseListingClassification,
  type ListingClassification,
} from '../../../shared/src/classification/ListingClassification.js';
import { operationalStatusToolOutputSchema } from '../../../mcp-server/src/tools/schemas.js';
import type {
  KnownIssuesLookup,
  KnownIssuesWebAnalysis,
  VehicleQuery,
} from '../../../mcp-server/src/tools/types.js';
import type {
  ClassificationCandidate,
  ListingClassificationResult,
  ListingClassifier,
} from './types.js';
import { ClassificationAttemptError } from './types.js';
import type { BatchLogger } from '../search.js';

const OPERATIONAL_STATUS_TOOL = 'check_operational_status';

export interface ClassificationMcpBridge {
  listTools(): Promise<Array<{ name: string }>>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export class SequentialMcpClassifier implements ListingClassifier {
  private constructor(
    private readonly mcp: ClassificationMcpBridge,
    private readonly knownIssuesLookup: KnownIssuesLookup,
    private readonly logger?: BatchLogger,
  ) {}

  static async create(options: {
    mcp: ClassificationMcpBridge;
    knownIssuesLookup: KnownIssuesLookup;
    logger?: BatchLogger;
  }): Promise<SequentialMcpClassifier> {
    const advertised = new Set((await options.mcp.listTools()).map(({ name }) => name));
    if (!advertised.has(OPERATIONAL_STATUS_TOOL)) {
      throw new Error(`Missing required MCP tool: ${OPERATIONAL_STATUS_TOOL}`);
    }
    return new SequentialMcpClassifier(options.mcp, options.knownIssuesLookup, options.logger);
  }

  async classify(candidate: ClassificationCandidate): Promise<ListingClassificationResult> {
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      this.logInvocation(candidate.externalId, OPERATIONAL_STATUS_TOOL);
      const operationalResult = operationalStatusToolOutputSchema.parse(
        await this.mcp.callTool(OPERATIONAL_STATUS_TOOL, {
          description: candidate.description ?? '',
        }),
      );
      inputTokens += operationalResult.usage.inputTokens;
      outputTokens += operationalResult.usage.outputTokens;

      if (operationalResult.operability.status === 'non_operational') {
        return {
          classification: parseListingClassification({
            operability: operationalResult.operability,
            knownIssuesWeb: {
              status: 'skipped',
              reason: operationalResult.operability.status,
            },
          }),
          inputTokens,
          outputTokens,
        };
      }

      const query: VehicleQuery = {
        brand: candidate.brand,
        model: candidate.model,
        ...(candidate.year === null ? {} : { year: candidate.year }),
      };
      const knownIssues: KnownIssuesWebAnalysis = await this.knownIssuesLookup(query);
      this.logLookup(candidate.externalId, knownIssues.found);

      return {
        classification: parseListingClassification({
          operability: operationalResult.operability,
          knownIssuesWeb: {
            status: 'completed',
            ...knownIssues,
          },
        }),
        inputTokens,
        outputTokens,
      };
    } catch (error) {
      throw new ClassificationAttemptError(
        'Listing classification attempt failed',
        inputTokens,
        outputTokens,
        classificationFailureCode(error),
        { cause: error },
      );
    }
  }

  private logInvocation(externalId: string, tool: string): void {
    this.logger?.info(
      { externalId, tool },
      'Invoking MCP classification tool',
    );
  }

  private logLookup(externalId: string, found: boolean): void {
    this.logger?.info(
      { externalId, found },
      'Resolved known issues from the model catalog',
    );
  }
}

function classificationFailureCode(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const code = Reflect.get(error, 'code');
    if (typeof code === 'string' && code.length > 0) return code;
    const status = Reflect.get(error, 'status');
    if (typeof status === 'number') return `anthropic_http_${status}`;
  }
  return error instanceof Error ? error.name : 'unknown_error';
}

export type { ListingClassification };
