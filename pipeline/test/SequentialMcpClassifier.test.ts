import { describe, expect, it, vi } from 'vitest';
import { SequentialMcpClassifier } from '../src/classify/SequentialMcpClassifier.js';
import type { ClassificationCandidate } from '../src/classify/types.js';

const candidate: ClassificationCandidate = {
  id: 'db-1', externalId: 'external-1', contentHash: 'hash', title: 'Toyota Corolla',
  description: 'Funciona perfectamente y se usa a diario.', price: '18000.00', brand: 'Toyota', model: 'Corolla',
  year: 2020, mileage: 70_000, fuelType: 'hybrid', transmission: 'automatic', bodyType: 'sedan', images: [],
};

describe('SequentialMcpClassifier', () => {
  it('classifies operability independently', async () => {
    const callTool = vi.fn().mockResolvedValue({
      operability: { status: 'non_operational', confidence: 'high', evidence: ['no arranca'], reason: 'No arranca.' },
      model: 'claude-sonnet-5', usage: { inputTokens: 10, outputTokens: 2, webSearchRequests: 0 },
    });
    const classifier = await SequentialMcpClassifier.create({ mcp: { listTools: advertisedTools, callTool } });
    await expect(classifier.classifyOperability(candidate)).resolves.toMatchObject({
      operability: { status: 'non_operational' }, inputTokens: 10, outputTokens: 2,
    });
    expect(callTool).toHaveBeenCalledWith('check_operational_status', { description: candidate.description });
  });

  it('researches categorized model-year issues with the strict contract', async () => {
    const callTool = vi.fn().mockResolvedValue({
      knownIssues: {
        mechanical: ['Desgaste prematuro de la bomba de agua.'], bodywork: [], interior: [],
        other: ['Campaña de software del airbag.'],
        sources: [{ title: 'Recall notice', url: 'https://example.test/recall' }],
      },
      model: 'claude-haiku-4-5-20251001',
      usage: { inputTokens: 20, outputTokens: 4, webSearchRequests: 1 },
    });
    const classifier = await SequentialMcpClassifier.create({ mcp: { listTools: advertisedTools, callTool } });
    await expect(classifier.researchKnownIssues(candidate)).resolves.toMatchObject({
      analysis: { mechanical: ['Desgaste prematuro de la bomba de agua.'], bodywork: [] },
      anthropicModel: 'claude-haiku-4-5-20251001', inputTokens: 20, outputTokens: 4,
    });
    expect(callTool).toHaveBeenCalledWith('check_known_issues_web', {
      brand: 'Toyota', model: 'Corolla', year: 2020,
    });
  });

  it('assesses one issue through the dedicated MCP tool', async () => {
    const callTool = vi.fn().mockResolvedValue({
      assessment: {
        severity: 'medium', estimatedCostMinEUR: 350, estimatedCostMaxEUR: 800,
        reasoning: 'La reparación requiere sustituir el componente.',
        sources: [{ title: 'Taller', url: 'https://example.test/taller' }],
      },
      pricingYear: 2026, model: 'claude-haiku-4-5-20251001',
      usage: { inputTokens: 22, outputTokens: 7, webSearchRequests: 1 },
    });
    const classifier = await SequentialMcpClassifier.create({ mcp: { listTools: advertisedTools, callTool } });
    const issue = {
      vehicleModelId: 'model-1', brand: 'Toyota', model: 'Corolla', issue: 'Fallo de bomba.',
      issueKey: 'key-1', cached: false,
    };
    await expect(classifier.assessIssueSeverityAndCost(issue)).resolves.toMatchObject({
      assessment: { severity: 'medium' }, pricingYear: 2026, inputTokens: 22, outputTokens: 7,
    });
    expect(callTool).toHaveBeenCalledWith('assess_issue_severity_and_cost', {
      issue: 'Fallo de bomba.', brand: 'Toyota', model: 'Corolla',
    });
  });

  it('requires both tools and rejects old web outputs', async () => {
    await expect(SequentialMcpClassifier.create({
      mcp: { listTools: async () => [{ name: 'check_operational_status' }], callTool: vi.fn() },
    })).rejects.toThrow('Missing required MCP tool: check_known_issues_web');
    const classifier = await SequentialMcpClassifier.create({
      mcp: { listTools: advertisedTools, callTool: vi.fn().mockResolvedValue({
        knownIssues: { found: true, summary: 'Formato antiguo.', sources: [] }, model: 'old',
        usage: { inputTokens: 1, outputTokens: 1, webSearchRequests: 1 },
      }) },
    });
    await expect(classifier.researchKnownIssues(candidate)).rejects.toMatchObject({ name: 'ClassificationAttemptError' });
  });
});

async function advertisedTools() {
  return [
    { name: 'check_operational_status' },
    { name: 'check_known_issues_web' },
    { name: 'assess_issue_severity_and_cost' },
  ];
}
