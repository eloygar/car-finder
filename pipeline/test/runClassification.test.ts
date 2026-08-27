import { describe, expect, it, vi } from 'vitest';
import { runClassification } from '../src/classify/runClassification.js';
import type { ClassificationCandidate, ClassificationRepository, ListingClassifier } from '../src/classify/types.js';
import { ClassificationAttemptError } from '../src/classify/types.js';

const candidate: ClassificationCandidate = {
  id: 'db-1', externalId: 'wallapop-1', contentHash: 'hash', title: 'Car', description: null,
  price: '10000.00', brand: 'Toyota', model: 'Corolla', year: 2020, mileage: 50_000,
  fuelType: 'hybrid', transmission: null, bodyType: null, images: [],
};
const operability = { status: 'unknown' as const, confidence: 'low' as const, evidence: [], reason: 'No hay evidencia.' };
const analysis = {
  mechanical: ['Desgaste de la bomba de agua.'], bodywork: [], interior: [], other: [],
  sources: [{ title: 'Source', url: 'https://example.test/source' }],
};
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const run = { all: true, dryRun: false, force: false, refreshKnownIssues: false };

function repository(cached = false, saved = true): ClassificationRepository {
  return {
    findCandidates: vi.fn().mockResolvedValue([candidate]),
    findKnownModelIssues: vi.fn().mockResolvedValue(cached),
    findIssueAssessmentCandidates: vi.fn().mockResolvedValue([]),
    saveIssueAssessment: vi.fn().mockResolvedValue(undefined),
    saveClassification: vi.fn().mockResolvedValue(saved),
  };
}

function classifier(): ListingClassifier {
  return {
    classifyOperability: vi.fn().mockResolvedValue({ operability, inputTokens: 10, outputTokens: 2 }),
    researchKnownIssues: vi.fn().mockResolvedValue({
      analysis, anthropicModel: 'claude-haiku', inputTokens: 20, outputTokens: 4,
    }),
    assessIssueSeverityAndCost: vi.fn().mockResolvedValue({
      assessment: {
        severity: 'medium', estimatedCostMinEUR: 300, estimatedCostMaxEUR: 700,
        reasoning: 'Coste documentado.', sources: [{ title: 'Taller', url: 'https://example.test' }],
      },
      pricingYear: 2026, anthropicModel: 'claude-haiku', inputTokens: 5, outputTokens: 2,
    }),
  };
}

describe('runClassification', () => {
  it('does not create a paid session during dry-run', async () => {
    const createSession = vi.fn();
    const summary = await runClassification({
      run: { ...run, dryRun: true }, repository: repository(), createSession, logger,
    });
    expect(summary).toMatchObject({ selected: 1, classified: 0, version: 'v4-operability-model-issues' });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('researches a cache miss and persists operability plus relational issues', async () => {
    const repo = repository();
    const service = classifier();
    const summary = await runClassification({
      run, repository: repo, logger, now: () => new Date('2026-08-25T12:00:00Z'),
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });
    expect(summary).toMatchObject({ classified: 1, inputTokens: 30, outputTokens: 6 });
    expect(repo.saveClassification).toHaveBeenCalledWith(expect.objectContaining({
      candidate, classification: { operability }, version: 'v4-operability-model-issues',
      researchedIssues: { analysis, anthropicModel: 'claude-haiku', analysisVersion: 'v1-categorized' },
    }));
  });

  it('reuses cached issues and skips research for non-operational or yearless cars', async () => {
    const cachedRepo = repository(true);
    const cachedClassifier = classifier();
    await runClassification({
      run, repository: cachedRepo, logger,
      createSession: async () => ({ classifier: cachedClassifier, close: vi.fn() }),
    });
    expect(cachedClassifier.researchKnownIssues).not.toHaveBeenCalled();

    for (const variant of [
      { ...candidate, year: null },
      candidate,
    ]) {
      const repo = repository(false);
      vi.mocked(repo.findCandidates).mockResolvedValue([variant]);
      const service = classifier();
      if (variant.year !== null) vi.mocked(service.classifyOperability).mockResolvedValue({
        operability: { ...operability, status: 'non_operational' }, inputTokens: 1, outputTokens: 1,
      });
      await runClassification({
        run, repository: repo, logger,
        createSession: async () => ({ classifier: service, close: vi.fn() }),
      });
      expect(service.researchKnownIssues).not.toHaveBeenCalled();
    }
  });

  it('refreshes cached issues explicitly and does only one search per model-year', async () => {
    const second = {
      ...candidate, id: 'db-2', externalId: 'wallapop-2', brand: ' toyota ', model: ' COROLLA  ',
    };
    const repo = repository(true);
    vi.mocked(repo.findCandidates).mockResolvedValue([candidate, second]);
    const service = classifier();
    await runClassification({
      run: { ...run, refreshKnownIssues: true }, repository: repo, logger,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });
    expect(service.researchKnownIssues).toHaveBeenCalledOnce();
  });

  it('does not save anything when required web research fails', async () => {
    const repo = repository(false);
    const service = classifier();
    vi.mocked(service.researchKnownIssues).mockRejectedValue(
      new ClassificationAttemptError('provider failed', 9, 4, 'anthropic_http_503'),
    );
    const summary = await runClassification({
      run, repository: repo, logger,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });
    expect(summary).toMatchObject({ failed: 1, classified: 0, inputTokens: 19, outputTokens: 6 });
    expect(repo.saveClassification).not.toHaveBeenCalled();
  });

  it('keeps classification and successful assessments when another assessment fails', async () => {
    const repo = repository(true);
    vi.mocked(repo.findIssueAssessmentCandidates).mockResolvedValue([
      { vehicleModelId: 'model-1', brand: 'Toyota', model: 'Corolla', issue: 'Cached', issueKey: 'cached', cached: true },
      { vehicleModelId: 'model-1', brand: 'Toyota', model: 'Corolla', issue: 'Success', issueKey: 'success', cached: false },
      { vehicleModelId: 'model-1', brand: 'Toyota', model: 'Corolla', issue: 'Failure', issueKey: 'failure', cached: false },
    ]);
    const service = classifier();
    vi.mocked(service.assessIssueSeverityAndCost)
      .mockResolvedValueOnce({
        assessment: {
          severity: 'high', estimatedCostMinEUR: 800, estimatedCostMaxEUR: 1_600,
          reasoning: 'Reparación documentada.', sources: [{ title: 'Taller', url: 'https://example.test' }],
        },
        pricingYear: 2026, anthropicModel: 'claude-haiku', inputTokens: 6, outputTokens: 3,
      })
      .mockRejectedValueOnce(new ClassificationAttemptError('failed', 2, 1, 'mcp_issue_assessment_failed'));

    const summary = await runClassification({
      run, repository: repo, logger,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });

    expect(summary).toMatchObject({
      classified: 1, failed: 0, assessmentsSelected: 3, assessed: 1,
      assessmentCached: 1, assessmentFailed: 1, inputTokens: 18, outputTokens: 6,
    });
    expect(repo.saveClassification).toHaveBeenCalledOnce();
    expect(repo.saveIssueAssessment).toHaveBeenCalledOnce();
    expect(repo.saveIssueAssessment).toHaveBeenCalledWith(expect.objectContaining({
      candidate: expect.objectContaining({ issueKey: 'success' }),
      analysisVersion: 'v1-spain-mixed-cost',
    }));
  });
});
