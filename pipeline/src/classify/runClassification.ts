import type { BatchLogger } from '../search.js';
import type {
  ClassificationRepository,
  ClassificationRunOptions,
  ClassificationSummary,
  ClassifierSession,
} from './types.js';
import { CLASSIFICATION_VERSION } from './types.js';
import { ClassificationAttemptError } from './types.js';

export async function runClassification(options: {
  run: ClassificationRunOptions;
  repository: ClassificationRepository;
  createSession?: () => Promise<ClassifierSession>;
  logger: BatchLogger;
  now?: () => Date;
}): Promise<ClassificationSummary> {
  const candidates = await options.repository.findCandidates(options.run, CLASSIFICATION_VERSION);
  const summary: ClassificationSummary = {
    selected: candidates.length,
    classified: 0,
    failed: 0,
    stale: 0,
    inputTokens: 0,
    outputTokens: 0,
    dryRun: options.run.dryRun,
    version: CLASSIFICATION_VERSION,
  };
  if (options.run.dryRun || candidates.length === 0) return summary;
  if (!options.createSession) throw new Error('Classifier session is required for a live run');

  const session = await options.createSession();
  try {
    for (const candidate of candidates) {
      try {
        const result = await session.classifier.classify(candidate);
        summary.inputTokens += result.inputTokens;
        summary.outputTokens += result.outputTokens;
        const saved = await options.repository.saveClassification({
          id: candidate.id,
          contentHash: candidate.contentHash,
          classification: result.classification,
          version: CLASSIFICATION_VERSION,
          classifiedAt: options.now?.() ?? new Date(),
        });
        if (saved) summary.classified += 1;
        else summary.stale += 1;
      } catch (error) {
        if (error instanceof ClassificationAttemptError) {
          summary.inputTokens += error.inputTokens;
          summary.outputTokens += error.outputTokens;
        }
        summary.failed += 1;
        options.logger.error(
          {
            externalId: candidate.externalId,
            errorType: error instanceof Error ? error.name : typeof error,
            failureCode: error instanceof ClassificationAttemptError
              ? error.failureCode
              : 'unexpected_error',
          },
          'Listing classification failed',
        );
      }
    }
  } finally {
    await session.close();
  }
  return summary;
}
