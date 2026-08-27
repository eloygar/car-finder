import { describe, expect, it, vi } from 'vitest';

import { SequentialMcpClassifier } from '../src/classify/SequentialMcpClassifier.js';
import type { ClassificationCandidate } from '../src/classify/types.js';

const candidate: ClassificationCandidate = {
  id: 'db-1', externalId: 'external-1', contentHash: 'hash', title: 'Toyota Corolla',
  description: 'Funciona perfectamente y se usa a diario.', price: '18000.00', brand: 'Toyota', model: 'Corolla',
  year: 2020, mileage: 70_000, fuelType: 'hybrid', transmission: 'automatic',
  bodyType: 'sedan', images: ['https://cdn.wallapop.com/one.jpg'],
};

const usage = { inputTokens: 10, outputTokens: 2, webSearchRequests: 0 };

const operationalKnownIssues = {
  found: true,
  summary: 'This model has a documented recall.',
  sources: [{ title: 'Recall notice', url: 'https://example.test/recall' }],
  issues: [],
};

describe('SequentialMcpClassifier', () => {
  it('short-circuits and persists a partial result for non-operational vehicles', async () => {
    const callTool = vi.fn().mockResolvedValueOnce({
      operability: {
        status: 'non_operational', confidence: 'high',
        evidence: ['no arranca'], reason: 'The seller says it does not start.',
      },
      model: 'claude-sonnet-5', usage,
    });
    const classifier = await SequentialMcpClassifier.create({
      mcp: { listTools: advertisedTools, callTool },
      knownIssuesLookup: vi.fn(),
    });

    const result = await classifier.classify(candidate);

    expect(callTool).toHaveBeenCalledOnce();
    expect(callTool).toHaveBeenCalledWith('check_operational_status', {
      description: candidate.description,
    });
    expect(result).toEqual({
      classification: {
        operability: {
          status: 'non_operational', confidence: 'high',
          evidence: ['no arranca'], reason: 'The seller says it does not start.',
        },
        knownIssuesWeb: { status: 'skipped', reason: 'non_operational' },
      },
      inputTokens: 10,
      outputTokens: 2,
    });
  });

  it('reads known issues from the model catalog when the vehicle is operational', async () => {
    const callToolMock = vi.fn()
      .mockResolvedValueOnce({
        operability: {
          status: 'operational', confidence: 'high',
          evidence: ['se usa a diario'], reason: 'Currently driven.',
        },
        model: 'claude-sonnet-5', usage,
      });
    const knownIssuesLookup = vi.fn().mockResolvedValue(operationalKnownIssues);
    const classifier = await SequentialMcpClassifier.create({
      mcp: { listTools: advertisedTools, callTool: callToolMock },
      knownIssuesLookup,
    });

    const result = await classifier.classify(candidate);

    expect(callToolMock).toHaveBeenCalledOnce();
    expect(knownIssuesLookup).toHaveBeenCalledWith({ brand: 'Toyota', model: 'Corolla', year: 2020 });
    expect(result).toMatchObject({
      classification: { knownIssuesWeb: { status: 'completed', found: true } },
      inputTokens: 10,
      outputTokens: 2,
    });
  });

  it('reads known issues from the model catalog when operability is unknown', async () => {
    const callTool = vi.fn()
      .mockResolvedValueOnce({
        operability: {
          status: 'unknown', confidence: 'low', evidence: [],
          reason: 'The description does not establish operability.',
        },
        model: 'claude-sonnet-5', usage,
      });
    const knownIssuesLookup = vi.fn().mockResolvedValue({
      found: false, summary: 'No documented model-level issue was found.', sources: [], issues: [],
    });
    const classifier = await SequentialMcpClassifier.create({
      mcp: { listTools: advertisedTools, callTool },
      knownIssuesLookup,
    });

    const result = await classifier.classify(candidate);

    expect(callTool).toHaveBeenCalledOnce();
    expect(result.classification).toMatchObject({
      operability: { status: 'unknown' },
      knownIssuesWeb: { status: 'completed', found: false },
    });
  });

  it('requires the operational-status tool and rejects malformed lookups', async () => {
    await expect(SequentialMcpClassifier.create({
      mcp: { listTools: async () => [{ name: 'check_known_issues_web' }], callTool: vi.fn() },
      knownIssuesLookup: vi.fn(),
    })).rejects.toThrow('Missing required MCP tool: check_operational_status');

    const classifier = await SequentialMcpClassifier.create({
      mcp: { listTools: advertisedTools, callTool: vi.fn().mockResolvedValue({ status: 'invalid' }) },
      knownIssuesLookup: vi.fn().mockResolvedValue({ status: 'invalid' }),
    });
    await expect(classifier.classify(candidate)).rejects.toMatchObject({
      name: 'ClassificationAttemptError', inputTokens: 0, outputTokens: 0,
    });
  });
});

async function advertisedTools() {
  return [{ name: 'check_operational_status' }, { name: 'check_known_issues_web' }];
}
