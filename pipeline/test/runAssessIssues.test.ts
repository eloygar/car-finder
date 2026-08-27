import { describe, expect, it, vi } from 'vitest';
import { runAssessIssues } from '../src/assessIssues/runAssessIssues.js';
import type { IssueAssessmentRepository } from '../src/assessIssues/types.js';
import type { ListingClassifier } from '../src/classify/types.js';

const candidates = [
  { vehicleModelId: 'model-1', brand: 'Toyota', model: 'Corolla', issue: 'One', issueKey: 'one', cached: false },
  { vehicleModelId: 'model-1', brand: 'Toyota', model: 'Corolla', issue: 'Two', issueKey: 'two', cached: false },
];
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function repository(): IssueAssessmentRepository {
  return { findCandidates: vi.fn().mockResolvedValue(candidates), save: vi.fn().mockResolvedValue(undefined) };
}

function classifier(): ListingClassifier {
  return {
    classifyOperability: vi.fn(), researchKnownIssues: vi.fn(),
    extractListingIssues: vi.fn(),
    assessIssueSeverityAndCost: vi.fn().mockResolvedValue({
      assessment: {
        severity: 'medium', estimatedCostMinEUR: 300, estimatedCostMaxEUR: 700,
        reasoning: 'Coste documentado.', sources: [{ title: 'Taller', url: 'https://example.test' }],
      },
      pricingYear: 2026, anthropicModel: 'claude-haiku', inputTokens: 5, outputTokens: 2,
    }),
  };
}

describe('runAssessIssues', () => {
  it('dry-run selects without starting a paid session', async () => {
    const createSession = vi.fn();
    await expect(runAssessIssues({
      run: { all: false, dryRun: true, force: false, limit: 20 },
      repository: repository(), createSession, logger,
    })).resolves.toMatchObject({ assessmentsSelected: 2, assessed: 0, dryRun: true });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('persists successes independently and continues after a failure', async () => {
    const repo = repository();
    const service = classifier();
    vi.mocked(service.assessIssueSeverityAndCost).mockRejectedValueOnce(new Error('failed'));
    const summary = await runAssessIssues({
      run: { all: true, dryRun: false, force: false }, repository: repo, logger,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
      now: () => new Date('2026-08-27T12:00:00Z'),
    });
    expect(summary).toMatchObject({ assessmentsSelected: 2, assessed: 1, assessmentFailed: 1 });
    expect(repo.save).toHaveBeenCalledOnce();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({
      candidate: expect.objectContaining({ issueKey: 'two' }), analysisVersion: 'v1-spain-mixed-cost',
    }));
  });
});
