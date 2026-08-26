import { describe, expect, it, vi } from 'vitest';

import { runClassification } from '../src/classify/runClassification.js';
import type { ClassificationCandidate, ClassificationRepository } from '../src/classify/types.js';
import { ClassificationAttemptError } from '../src/classify/types.js';

const candidate: ClassificationCandidate = {
  id: 'db-1', externalId: 'wallapop-1', contentHash: 'hash', title: 'Car',
  description: null, price: '10000.00', brand: 'Toyota', model: 'Corolla', year: 2020,
  mileage: 50_000, fuelType: 'hybrid', transmission: null, bodyType: null, images: [],
};
const classification = {
  status: 'unknown' as const,
  confidence: 'low' as const,
  evidence: [],
  reason: 'The description does not establish operability.',
};
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function repository(saved = true): ClassificationRepository {
  return {
    findCandidates: vi.fn().mockResolvedValue([candidate]),
    saveClassification: vi.fn().mockResolvedValue(saved),
  };
}

describe('runClassification', () => {
  it('does not create a paid session during dry-run', async () => {
    const createSession = vi.fn();
    const summary = await runClassification({
      run: { all: true, dryRun: true, force: false }, repository: repository(), createSession, logger,
    });
    expect(summary).toMatchObject({ selected: 1, classified: 0, dryRun: true, version: 'v2-operability' });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('persists successful results and aggregates tokens', async () => {
    const repo = repository();
    const close = vi.fn().mockResolvedValue(undefined);
    const summary = await runClassification({
      run: { all: true, dryRun: false, force: false },
      repository: repo,
      logger,
      now: () => new Date('2026-08-25T12:00:00Z'),
      createSession: async () => ({
        close,
        classifier: { classify: vi.fn().mockResolvedValue({ classification, inputTokens: 120, outputTokens: 30 }) },
      }),
    });
    expect(summary).toMatchObject({ classified: 1, inputTokens: 120, outputTokens: 30 });
    expect(repo.saveClassification).toHaveBeenCalledWith(expect.objectContaining({
      id: 'db-1', contentHash: 'hash', version: 'v2-operability', classifiedAt: new Date('2026-08-25T12:00:00Z'),
    }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('continues after failures and counts stale optimistic updates', async () => {
    const second = { ...candidate, id: 'db-2', externalId: 'wallapop-2' };
    const repo: ClassificationRepository = {
      findCandidates: vi.fn().mockResolvedValue([candidate, second]),
      saveClassification: vi.fn().mockResolvedValue(false),
    };
    const classify = vi.fn()
      .mockRejectedValueOnce(new ClassificationAttemptError('provider failed', 9, 4, 'anthropic_http_503'))
      .mockResolvedValueOnce({ classification, inputTokens: 2, outputTokens: 1 });
    const summary = await runClassification({
      run: { all: true, dryRun: false, force: false }, repository: repo, logger,
      createSession: async () => ({ classifier: { classify }, close: vi.fn() }),
    });
    expect(summary).toMatchObject({
      failed: 1, stale: 1, classified: 0, inputTokens: 11, outputTokens: 5,
    });
    expect(classify).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'anthropic_http_503' }),
      'Listing classification failed',
    );
  });
});
