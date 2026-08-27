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
    saveClassification: vi.fn().mockResolvedValue(saved),
  };
}

function classifier(): ListingClassifier {
  return {
    classifyOperability: vi.fn().mockResolvedValue({ operability, inputTokens: 10, outputTokens: 2 }),
    researchKnownIssues: vi.fn().mockResolvedValue({
      analysis, anthropicModel: 'claude-haiku', inputTokens: 20, outputTokens: 4,
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
});
