import {
  knownIssuesWebToolOutputSchema,
  operationalStatusToolOutputSchema,
} from '../../../mcp-server/src/tools/schemas.js';
import type {
  ClassificationCandidate,
  KnownIssuesResearchResult,
  ListingClassificationResult,
  ListingClassifier,
} from './types.js';
import { ClassificationAttemptError } from './types.js';
import type { BatchLogger } from '../search.js';

const OPERATIONAL_STATUS_TOOL = 'check_operational_status';
const KNOWN_ISSUES_WEB_TOOL = 'check_known_issues_web';

export interface ClassificationMcpBridge {
  listTools(): Promise<Array<{ name: string }>>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export class SequentialMcpClassifier implements ListingClassifier {
  private constructor(
    private readonly mcp: ClassificationMcpBridge,
    private readonly logger?: BatchLogger,
  ) {}

  static async create(options: {
    mcp: ClassificationMcpBridge;
    logger?: BatchLogger;
  }): Promise<SequentialMcpClassifier> {
    const advertised = new Set((await options.mcp.listTools()).map(({ name }) => name));
    for (const tool of [OPERATIONAL_STATUS_TOOL, KNOWN_ISSUES_WEB_TOOL]) {
      if (!advertised.has(tool)) throw new Error(`Missing required MCP tool: ${tool}`);
    }
    return new SequentialMcpClassifier(options.mcp, options.logger);
  }

  async classifyOperability(candidate: ClassificationCandidate): Promise<ListingClassificationResult> {
    try {
      this.logInvocation(candidate.externalId, OPERATIONAL_STATUS_TOOL);
      const operationalResult = operationalStatusToolOutputSchema.parse(
        await this.mcp.callTool(OPERATIONAL_STATUS_TOOL, {
          description: candidate.description ?? '',
        }),
      );
      return {
        operability: operationalResult.operability,
        inputTokens: operationalResult.usage.inputTokens,
        outputTokens: operationalResult.usage.outputTokens,
      };
    } catch (error) {
      throw new ClassificationAttemptError(
        'Listing classification attempt failed',
        0,
        0,
        classificationFailureCode(error),
        { cause: error },
      );
    }
  }

  async researchKnownIssues(candidate: ClassificationCandidate): Promise<KnownIssuesResearchResult> {
    if (candidate.year === null) throw new Error('A model year is required for known-issues research');
    try {
      this.logInvocation(candidate.externalId, KNOWN_ISSUES_WEB_TOOL);
      const result = knownIssuesWebToolOutputSchema.parse(
        await this.mcp.callTool(KNOWN_ISSUES_WEB_TOOL, {
          brand: candidate.brand,
          model: candidate.model,
          year: candidate.year,
        }),
      );
      return {
        analysis: result.knownIssues,
        anthropicModel: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      };
    } catch (error) {
      throw new ClassificationAttemptError(
        'Known model issues research failed', 0, 0,
        classificationFailureCode(error), { cause: error },
      );
    }
  }

  private logInvocation(externalId: string, tool: string): void {
    this.logger?.info(
      { externalId, tool },
      'Invoking MCP classification tool',
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
