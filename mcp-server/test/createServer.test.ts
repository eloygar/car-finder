import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMcpServer } from '../src/createServer.js';
import type { McpToolRepository, VehicleAnalysisService } from '../src/tools/types.js';

const closeCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closeCallbacks.splice(0).map((close) => close()));
});

async function connectedClient(
  repository: McpToolRepository,
  enableLegacyTools = false,
  service: VehicleAnalysisService = analysisService(),
) {
  const logger = { error: vi.fn() };
  const server = createMcpServer({ repository, logger, enableLegacyTools, analysisService: service });
  const client = new Client({ name: 'unit-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  closeCallbacks.push(async () => {
    await client.close();
    await server.close();
  });
  return { client, logger };
}

describe('createMcpServer', () => {
  it('advertises the four AI analysis tools by default and returns structured content', async () => {
    const repository: McpToolRepository = {
      findKnownIssues: vi.fn().mockResolvedValue([]),
      findComparablePrices: vi.fn().mockResolvedValue(['1.00', '2.00', '3.00']),
    };
    const { client } = await connectedClient(repository);

    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name)).toEqual([
      'check_operational_status',
      'extract_vehicle_issues_from_text',
      'assess_issue_severity_and_cost',
      'check_known_issues_web',
    ]);
    expect(listed.tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
    expect(listed.tools.every((tool) => tool.inputSchema.additionalProperties === false)).toBe(true);

    const result = await client.callTool({
      name: 'check_operational_status',
      arguments: {
        description: 'Funciona perfectamente.',
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      operability: {
        status: 'operational', confidence: 'high', evidence: ['Funciona perfectamente'],
        reason: 'The seller explicitly says it works.',
      },
      model: 'claude-sonnet-5',
      usage: { inputTokens: 10, outputTokens: 2, webSearchRequests: 0 },
    });
    expect(JSON.parse(result.content[0]?.type === 'text' ? result.content[0].text : '')).toEqual(
      result.structuredContent,
    );

  });

  it('exposes the two database analysis tools only behind the legacy flag', async () => {
    const repository: McpToolRepository = {
      findKnownIssues: vi.fn().mockResolvedValue([]),
      findComparablePrices: vi.fn().mockResolvedValue([]),
    };
    const { client } = await connectedClient(repository, true);
    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name).sort()).toEqual([
      'assess_issue_severity_and_cost',
      'check_known_issues',
      'check_known_issues_web',
      'check_operational_status',
      'classify_vehicle_operability',
      'estimate_market_price',
      'extract_vehicle_issues_from_text',
    ]);
  });

  it('downgrades an ungrounded operability claim at the protocol boundary', async () => {
    const repository: McpToolRepository = {
      findKnownIssues: vi.fn().mockResolvedValue([]),
      findComparablePrices: vi.fn().mockResolvedValue([]),
    };
    const { client } = await connectedClient(repository, true);

    const result = await client.callTool({
      name: 'classify_vehicle_operability',
      arguments: {
        description: 'No dice nada relevante.',
        status: 'operational',
        confidence: 'high',
        evidence: ['funciona perfectamente'],
        reason: 'Unsupported claim.',
      },
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual({
      status: 'unknown',
      confidence: 'low',
      evidence: [],
      reason: 'No hay evidencia literal en la descripción que permita determinar de forma concluyente si el vehículo está operativo.',
    });
    expect(repository.findKnownIssues).not.toHaveBeenCalled();
  });

  it('converts repository failures to safe tool errors and keeps serving', async () => {
    const repository: McpToolRepository = {
      findKnownIssues: vi.fn()
        .mockRejectedValueOnce(new Error('postgresql://user:secret@example.invalid/database'))
        .mockResolvedValueOnce([]),
      findComparablePrices: vi.fn().mockResolvedValue([]),
    };
    const { client, logger } = await connectedClient(repository, true);

    const failed = await client.callTool({
      name: 'check_known_issues',
      arguments: { brand: 'Toyota', model: 'Corolla' },
    });
    expect(failed.isError).toBe(true);
    expect(JSON.stringify(failed)).not.toContain('secret');
    expect(JSON.stringify(vi.mocked(logger.error).mock.calls)).not.toContain('secret');

    const recovered = await client.callTool({
      name: 'check_known_issues',
      arguments: { brand: 'Toyota', model: 'Corolla' },
    });
    expect(recovered.isError).not.toBe(true);
  });

  it('logs safe local assessment failure reasons without exposing them through MCP', async () => {
    const repository: McpToolRepository = {
      findKnownIssues: vi.fn().mockResolvedValue([]),
      findComparablePrices: vi.fn().mockResolvedValue([]),
    };
    const service = analysisService();
    vi.mocked(service.assessIssueSeverityAndCost).mockRejectedValue(
      Object.assign(new Error('Repair cost evidence was insufficient'), {
        code: 'repair_cost_evidence_insufficient',
      }),
    );
    const { client, logger } = await connectedClient(repository, false, service);

    const failed = await client.callTool({
      name: 'assess_issue_severity_and_cost',
      arguments: { issue: 'Accesorio no instalado', brand: 'Lexus', model: 'IS' },
    });

    expect(failed.isError).toBe(true);
    expect(JSON.stringify(failed)).not.toContain('evidence was insufficient');
    expect(JSON.stringify(failed)).toContain('repair_cost_evidence_insufficient');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ localMessage: 'Repair cost evidence was insufficient' }),
      'MCP tool execution failed',
    );
  });
});

function analysisService(): VehicleAnalysisService {
  return {
    checkOperationalStatus: vi.fn().mockResolvedValue({
      operability: {
        status: 'operational', confidence: 'high', evidence: ['Funciona perfectamente'],
        reason: 'The seller explicitly says it works.',
      },
      model: 'claude-sonnet-5',
      usage: { inputTokens: 10, outputTokens: 2, webSearchRequests: 0 },
    }),
    checkKnownIssuesWeb: vi.fn().mockResolvedValue({
      knownIssues: { mechanical: [], bodywork: [], interior: [], other: [], sources: [] },
      model: 'claude-haiku-4-5-20251001',
      usage: { inputTokens: 20, outputTokens: 4, webSearchRequests: 1 },
    }),
    extractVehicleIssuesFromText: vi.fn().mockResolvedValue({
      issues: { mechanical: [], bodywork: [], interior: [], other: [] },
      model: 'claude-haiku-4-5-20251001',
      usage: { inputTokens: 8, outputTokens: 2, webSearchRequests: 0 },
    }),
    assessIssueSeverityAndCost: vi.fn().mockResolvedValue({
      assessment: {
        severity: 'medium', estimatedCostMinEUR: 400, estimatedCostMaxEUR: 900,
        reasoning: 'La reparación requiere piezas y mano de obra.',
        sources: [{ title: 'Taller', url: 'https://example.test/taller' }],
      },
      pricingYear: 2026,
      model: 'claude-haiku-4-5-20251001',
      usage: { inputTokens: 30, outputTokens: 8, webSearchRequests: 1 },
    }),
  };
}
