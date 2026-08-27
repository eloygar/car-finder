import type { BatchLogger } from '../search.js';
import type {
  ClassificationRepository,
  ClassificationRunOptions,
  ClassificationSummary,
  ClassifierSession,
} from './types.js';
import { CLASSIFICATION_VERSION } from './types.js';
import { ClassificationAttemptError } from './types.js';
import { parseListingClassification } from '../../../shared/src/classification/ListingClassification.js';
import { KNOWN_MODEL_ISSUES_VERSION } from './types.js';
import { normalizeTaxonomyLabel } from '../../../shared/src/vehicleTaxonomy.js';

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
  const refreshedModelYears = new Set<string>();
  try {
    for (const candidate of candidates) {
      try {
        const result = await session.classifier.classifyOperability(candidate);
        summary.inputTokens += result.inputTokens;
        summary.outputTokens += result.outputTokens;
        let researchedIssues;
        if (result.operability.status !== 'non_operational' && candidate.year !== null) {
          const cacheKey = modelYearKey(candidate.brand, candidate.model, candidate.year);
          const alreadyRefreshed = refreshedModelYears.has(cacheKey);
          const cached = alreadyRefreshed || await options.repository.findKnownModelIssues(candidate);
          if (!cached || (options.run.refreshKnownIssues && !alreadyRefreshed)) {
            const research = await session.classifier.researchKnownIssues(candidate);
            summary.inputTokens += research.inputTokens;
            summary.outputTokens += research.outputTokens;
            researchedIssues = {
              analysis: research.analysis,
              anthropicModel: research.anthropicModel,
              analysisVersion: KNOWN_MODEL_ISSUES_VERSION,
            };
          }
        }
        const saved = await options.repository.saveClassification({
          candidate,
          classification: parseListingClassification({ operability: result.operability }),
          version: CLASSIFICATION_VERSION,
          classifiedAt: options.now?.() ?? new Date(),
          ...(researchedIssues ? { researchedIssues } : {}),
        });
        if (saved) {
          summary.classified += 1;
          if (researchedIssues && candidate.year !== null) {
            refreshedModelYears.add(modelYearKey(candidate.brand, candidate.model, candidate.year));
          }
        }
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

function modelYearKey(brand: string, model: string, year: number): string {
  return `${normalizeTaxonomyLabel(brand)}\u0000${normalizeTaxonomyLabel(model)}\u0000${year}`;
}
