import { describe, expect, it, vi } from 'vitest';
import { runClassification } from '../src/classify/runClassification.js';
import type { ClassificationCandidate, ClassificationRepository, ListingClassifier } from '../src/classify/types.js';
import { ClassificationAttemptError } from '../src/classify/types.js';
import { KNOWN_MODEL_ISSUES_VERSION } from '../../shared/src/knownModelIssues.js';

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
    findListingIssueExtraction: vi.fn().mockResolvedValue({ issueCount: 0 }),
    findIssueAssessmentCandidates: vi.fn().mockResolvedValue([]),
    findListingIssueAssessmentCandidates: vi.fn().mockResolvedValue([]),
    saveIssueAssessment: vi.fn().mockResolvedValue(undefined),
    saveListingIssueAssessment: vi.fn().mockResolvedValue(undefined),
    saveClassification: vi.fn().mockResolvedValue(saved),
  };
}

function classifier(): ListingClassifier {
  return {
    classifyOperability: vi.fn().mockResolvedValue({ operability, inputTokens: 10, outputTokens: 2 }),
    researchKnownIssues: vi.fn().mockResolvedValue({
      analysis, anthropicModel: 'claude-haiku', inputTokens: 20, outputTokens: 4,
    }),
    extractListingIssues: vi.fn().mockResolvedValue({
      issues: { mechanical: [], bodywork: [], interior: [], other: [] },
      anthropicModel: 'claude-haiku', inputTokens: 4, outputTokens: 1,
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
    expect(summary).toMatchObject({ selected: 1, classified: 0, version: 'v5-operability-listing-issues' });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('researches a cache miss and persists operability plus relational issues', async () => {
    const repo = repository();
    const service = classifier();
    const onProgress = vi.fn();
    const summary = await runClassification({
      run, repository: repo, logger, now: () => new Date('2026-08-25T12:00:00Z'),
      onProgress,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });
    expect(summary).toMatchObject({ classified: 1, inputTokens: 30, outputTokens: 6 });
    expect(repo.saveClassification).toHaveBeenCalledWith(expect.objectContaining({
      candidate, classification: { operability }, version: 'v5-operability-listing-issues',
      researchedIssues: { analysis, anthropicModel: 'claude-haiku', analysisVersion: KNOWN_MODEL_ISSUES_VERSION },
    }));
    expect(onProgress).toHaveBeenCalledWith({
      current: 1, total: 1, externalId: candidate.externalId,
      status: 'success', assessmentFailures: 0, failureCodes: [],
    });
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
      modelIssueAssessmentsEnabled: true,
      listingIssueAssessmentsEnabled: true,
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
      modelIssueAssessmentsEnabled: true,
      listingIssueAssessmentsEnabled: true,
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

  it('extracts changed listing text, persists it atomically, and evaluates listing issues first', async () => {
    const described = { ...candidate, description: 'Pierde aceite.' };
    const repo = repository(true);
    vi.mocked(repo.findCandidates).mockResolvedValue([described]);
    vi.mocked(repo.findListingIssueExtraction).mockResolvedValue(null);
    vi.mocked(repo.findListingIssueAssessmentCandidates).mockResolvedValue([{
      detectedIssueId: 'detected-1', brand: 'Toyota', model: 'Corolla', year: 2020,
      issue: 'Pierde aceite.', issueKey: 'listing-key', evidence: ['Pierde aceite'], cached: false,
    }]);
    vi.mocked(repo.findIssueAssessmentCandidates).mockResolvedValue([{
      vehicleModelId: 'model-1', brand: 'Toyota', model: 'Corolla',
      issue: 'Fallo general.', issueKey: 'general-key', cached: false,
    }]);
    const service = classifier();
    vi.mocked(service.extractListingIssues).mockResolvedValue({
      issues: {
        mechanical: [{ description: 'Pierde aceite.', evidence: ['Pierde aceite'] }],
        bodywork: [], interior: [], other: [],
      }, anthropicModel: 'haiku', inputTokens: 4, outputTokens: 2,
    });

    const summary = await runClassification({
      run, repository: repo, logger,
      modelIssueAssessmentsEnabled: true,
      listingIssueAssessmentsEnabled: true,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });

    expect(repo.saveClassification).toHaveBeenCalledWith(expect.objectContaining({
      listingExtraction: expect.objectContaining({
        analysisVersion: 'v4-explicit-present-defects',
        issues: expect.objectContaining({ mechanical: [expect.objectContaining({ description: 'Pierde aceite.' })] }),
      }),
    }));
    expect(repo.findListingIssueExtraction).toHaveBeenCalledWith(
      described,
      expect.any(String),
      'v4-explicit-present-defects',
    );
    expect(summary).toMatchObject({
      listingIssuesDetected: 1, listingAssessmentsSelected: 1, listingAssessed: 1,
      assessmentsSelected: 1, assessed: 1,
    });
    expect(vi.mocked(service.assessIssueSeverityAndCost).mock.calls.map(([entry]) => entry.issueKey))
      .toEqual(['listing-key', 'general-key']);
  });

  it('completes empty descriptions without an extraction call and caches the empty result', async () => {
    const repo = repository(true);
    vi.mocked(repo.findListingIssueExtraction).mockResolvedValue(null);
    const service = classifier();
    await runClassification({
      run, repository: repo, logger,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });
    expect(service.extractListingIssues).not.toHaveBeenCalled();
    expect(repo.saveClassification).toHaveBeenCalledWith(expect.objectContaining({
      listingExtraction: expect.objectContaining({
        anthropicModel: 'not-invoked-empty-description',
        issues: { mechanical: [], bodywork: [], interior: [], other: [] },
      }),
    }));
  });

  it('does not persist classification when listing extraction fails', async () => {
    const repo = repository(true);
    vi.mocked(repo.findCandidates).mockResolvedValue([{ ...candidate, description: 'Tiene una avería.' }]);
    vi.mocked(repo.findListingIssueExtraction).mockResolvedValue(null);
    const service = classifier();
    vi.mocked(service.extractListingIssues).mockRejectedValue(
      new ClassificationAttemptError('invalid extraction', 3, 2, 'invalid_evidence'),
    );
    const summary = await runClassification({
      run, repository: repo, logger,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });
    expect(summary).toMatchObject({ classified: 0, failed: 1, inputTokens: 13, outputTokens: 4 });
    expect(repo.saveClassification).not.toHaveBeenCalled();
  });

  it('stops all MCP enrichment immediately for a non-operational listing', async () => {
    const repo = repository(true);
    vi.mocked(repo.findListingIssueAssessmentCandidates).mockResolvedValue([{
      detectedIssueId: 'detected-1', brand: 'Toyota', model: 'Corolla', year: 2020,
      issue: 'No arranca.', issueKey: 'listing-key', evidence: ['no arranca'], cached: false,
    }]);
    vi.mocked(repo.findIssueAssessmentCandidates).mockResolvedValue([{
      vehicleModelId: 'model-1', brand: 'Toyota', model: 'Corolla',
      issue: 'General.', issueKey: 'general-key', cached: false,
    }]);
    const service = classifier();
    vi.mocked(service.classifyOperability).mockResolvedValue({
      operability: { ...operability, status: 'non_operational' }, inputTokens: 1, outputTokens: 1,
    });
    const summary = await runClassification({
      run, repository: repo, logger,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });

    expect(summary).toMatchObject({
      classified: 1,
      listingIssuesDetected: 0,
      listingAssessmentsSelected: 0,
      listingAssessed: 0,
      assessmentsSelected: 0,
      assessed: 0,
    });
    expect(repo.saveClassification).toHaveBeenCalledWith(expect.objectContaining({
      candidate,
      classification: { operability: expect.objectContaining({ status: 'non_operational' }) },
      clearListingExtraction: true,
    }));
    expect(repo.findListingIssueExtraction).not.toHaveBeenCalled();
    expect(service.extractListingIssues).not.toHaveBeenCalled();
    expect(service.researchKnownIssues).not.toHaveBeenCalled();
    expect(repo.findListingIssueAssessmentCandidates).not.toHaveBeenCalled();
    expect(repo.findIssueAssessmentCandidates).not.toHaveBeenCalled();
    expect(service.assessIssueSeverityAndCost).not.toHaveBeenCalled();
  });

  it('skips both issue assessment types by default', async () => {
    const repo = repository(true);
    vi.mocked(repo.findListingIssueAssessmentCandidates).mockResolvedValue([{
      detectedIssueId: 'detected-1', brand: 'Toyota', model: 'Corolla', year: 2020,
      issue: 'Pierde aceite.', issueKey: 'listing-key', evidence: ['pierde aceite'], cached: false,
    }]);
    vi.mocked(repo.findIssueAssessmentCandidates).mockResolvedValue([{
      vehicleModelId: 'model-1', brand: 'Toyota', model: 'Corolla',
      issue: 'Problema general.', issueKey: 'general-key', cached: false,
    }]);
    const service = classifier();
    const summary = await runClassification({
      run, repository: repo, logger,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });
    expect(summary).toMatchObject({
      modelIssueAssessmentsEnabled: false,
      listingIssueAssessmentsEnabled: false,
      listingAssessmentsSelected: 0, listingAssessed: 0, assessmentsSelected: 0, assessed: 0,
    });
    expect(repo.findListingIssueAssessmentCandidates).not.toHaveBeenCalled();
    expect(repo.findIssueAssessmentCandidates).not.toHaveBeenCalled();
    expect(service.assessIssueSeverityAndCost).not.toHaveBeenCalled();
  });

  it('can enable listing-specific assessments without enabling model assessments', async () => {
    const repo = repository(true);
    vi.mocked(repo.findListingIssueAssessmentCandidates).mockResolvedValue([{
      detectedIssueId: 'detected-1', brand: 'Toyota', model: 'Corolla', year: 2020,
      issue: 'Pierde aceite.', issueKey: 'listing-key', evidence: ['pierde aceite'], cached: false,
    }]);
    const service = classifier();
    const summary = await runClassification({
      run, repository: repo, logger, listingIssueAssessmentsEnabled: true,
      createSession: async () => ({ classifier: service, close: vi.fn() }),
    });
    expect(summary).toMatchObject({
      modelIssueAssessmentsEnabled: false, listingIssueAssessmentsEnabled: true,
      listingAssessmentsSelected: 1, listingAssessed: 1, assessmentsSelected: 0,
    });
    expect(service.assessIssueSeverityAndCost).toHaveBeenCalledOnce();
  });
});
