import type { BatchLogger } from '../search.js';
import type {
  ClassificationRepository,
  ClassificationRunOptions,
  ClassificationSummary,
  ClassifierSession,
  ListingIssueAssessmentCandidate,
} from './types.js';
import { CLASSIFICATION_VERSION, LISTING_ISSUE_EXTRACTION_VERSION } from './types.js';
import { ClassificationAttemptError } from './types.js';
import { parseListingClassification } from '../../../shared/src/classification/ListingClassification.js';
import { KNOWN_MODEL_ISSUES_VERSION } from './types.js';
import { ISSUE_ASSESSMENT_VERSION } from './types.js';
import { normalizeTaxonomyLabel } from '../../../shared/src/vehicleTaxonomy.js';
import { listingIssueInputHash } from '../../../shared/src/listingIssueExtraction.js';
import type { ExtractedVehicleIssues } from '../../../mcp-server/src/tools/types.js';

export async function runClassification(options: {
  run: ClassificationRunOptions;
  repository: ClassificationRepository;
  createSession?: () => Promise<ClassifierSession>;
  logger: BatchLogger;
  now?: () => Date;
  modelIssueAssessmentsEnabled?: boolean;
}): Promise<ClassificationSummary> {
  const candidates = await options.repository.findCandidates(options.run, CLASSIFICATION_VERSION);
  const summary: ClassificationSummary = {
    selected: candidates.length,
    classified: 0,
    failed: 0,
    stale: 0,
    inputTokens: 0,
    outputTokens: 0,
    assessmentsSelected: 0,
    assessed: 0,
    assessmentCached: 0,
    assessmentFailed: 0,
    modelIssueAssessmentsEnabled: options.modelIssueAssessmentsEnabled ?? false,
    listingIssuesDetected: 0,
    listingAssessmentsSelected: 0,
    listingAssessed: 0,
    listingAssessmentCached: 0,
    listingAssessmentFailed: 0,
    dryRun: options.run.dryRun,
    version: CLASSIFICATION_VERSION,
  };
  if (options.run.dryRun || candidates.length === 0) return summary;
  if (!options.createSession) throw new Error('Classifier session is required for a live run');

  const session = await options.createSession();
  const refreshedModelYears = new Set<string>();
  const visitedAssessments = new Set<string>();
  try {
    for (const candidate of candidates) {
      try {
        const result = await session.classifier.classifyOperability(candidate);
        summary.inputTokens += result.inputTokens;
        summary.outputTokens += result.outputTokens;
        if (result.operability.status === 'non_operational') {
          const saved = await options.repository.saveClassification({
            candidate,
            classification: parseListingClassification({ operability: result.operability }),
            version: CLASSIFICATION_VERSION,
            classifiedAt: options.now?.() ?? new Date(),
            clearListingExtraction: true,
          });
          if (saved) summary.classified += 1;
          else summary.stale += 1;
          continue;
        }
        const extractionHash = listingIssueInputHash({
          description: candidate.description ?? '',
          brand: candidate.brand,
          model: candidate.model,
          year: candidate.year,
        });
        const cachedExtraction = await options.repository.findListingIssueExtraction(candidate, extractionHash);
        let listingExtraction;
        if (cachedExtraction) {
          summary.listingIssuesDetected += cachedExtraction.issueCount;
        } else if ((candidate.description ?? '').trim().length === 0) {
          listingExtraction = {
            inputHash: extractionHash,
            issues: emptyExtractedIssues(),
            anthropicModel: 'not-invoked-empty-description',
            analysisVersion: LISTING_ISSUE_EXTRACTION_VERSION,
          };
        } else {
          const extraction = await session.classifier.extractListingIssues(candidate);
          summary.inputTokens += extraction.inputTokens;
          summary.outputTokens += extraction.outputTokens;
          summary.listingIssuesDetected += extractedIssueCount(extraction.issues);
          listingExtraction = {
            inputHash: extractionHash,
            issues: extraction.issues,
            anthropicModel: extraction.anthropicModel,
            analysisVersion: LISTING_ISSUE_EXTRACTION_VERSION,
          };
        }
        let researchedIssues;
        if (candidate.year !== null) {
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
          ...(listingExtraction ? { listingExtraction } : {}),
        });
        if (saved) {
          summary.classified += 1;
          if (researchedIssues && candidate.year !== null) {
            refreshedModelYears.add(modelYearKey(candidate.brand, candidate.model, candidate.year));
          }
          let listingIssueCandidates: ListingIssueAssessmentCandidate[] = [];
          try {
            listingIssueCandidates = await options.repository.findListingIssueAssessmentCandidates(candidate);
          } catch (error) {
            summary.listingAssessmentFailed += 1;
            options.logger.error({
              externalId: candidate.externalId,
              errorType: error instanceof Error ? error.name : typeof error,
            }, 'Listing issue assessment candidates could not be loaded');
          }
          for (const assessmentCandidate of listingIssueCandidates) {
            summary.listingAssessmentsSelected += 1;
            if (assessmentCandidate.cached) {
              summary.listingAssessmentCached += 1;
              continue;
            }
            try {
              const assessment = await session.classifier.assessIssueSeverityAndCost(assessmentCandidate);
              summary.inputTokens += assessment.inputTokens;
              summary.outputTokens += assessment.outputTokens;
              await options.repository.saveListingIssueAssessment({
                candidate: assessmentCandidate,
                assessment: assessment.assessment,
                pricingYear: assessment.pricingYear,
                anthropicModel: assessment.anthropicModel,
                analysisVersion: ISSUE_ASSESSMENT_VERSION,
                assessedAt: options.now?.() ?? new Date(),
              });
              summary.listingAssessed += 1;
            } catch (error) {
              if (error instanceof ClassificationAttemptError) {
                summary.inputTokens += error.inputTokens;
                summary.outputTokens += error.outputTokens;
              }
              summary.listingAssessmentFailed += 1;
              options.logger.error({
                externalId: candidate.externalId,
                issueKey: assessmentCandidate.issueKey,
                errorType: error instanceof Error ? error.name : typeof error,
                failureCode: error instanceof ClassificationAttemptError
                  ? error.failureCode
                  : 'unexpected_error',
              }, 'Listing issue assessment failed');
            }
          }
          if (!options.modelIssueAssessmentsEnabled) continue;
          let issueCandidates;
          try {
            issueCandidates = await options.repository.findIssueAssessmentCandidates(candidate);
          } catch (error) {
            summary.assessmentFailed += 1;
            options.logger.error({
              externalId: candidate.externalId,
              errorType: error instanceof Error ? error.name : typeof error,
            }, 'Known issue assessment candidates could not be loaded');
            continue;
          }
          for (const assessmentCandidate of issueCandidates) {
            const key = `${assessmentCandidate.vehicleModelId}\u0000${assessmentCandidate.issueKey}`;
            if (visitedAssessments.has(key)) continue;
            visitedAssessments.add(key);
            summary.assessmentsSelected += 1;
            if (assessmentCandidate.cached) {
              summary.assessmentCached += 1;
              continue;
            }
            try {
              const assessment = await session.classifier.assessIssueSeverityAndCost(assessmentCandidate);
              summary.inputTokens += assessment.inputTokens;
              summary.outputTokens += assessment.outputTokens;
              await options.repository.saveIssueAssessment({
                candidate: assessmentCandidate,
                assessment: assessment.assessment,
                pricingYear: assessment.pricingYear,
                anthropicModel: assessment.anthropicModel,
                analysisVersion: ISSUE_ASSESSMENT_VERSION,
                assessedAt: options.now?.() ?? new Date(),
              });
              summary.assessed += 1;
            } catch (error) {
              if (error instanceof ClassificationAttemptError) {
                summary.inputTokens += error.inputTokens;
                summary.outputTokens += error.outputTokens;
              }
              summary.assessmentFailed += 1;
              options.logger.error({
                externalId: candidate.externalId,
                issueKey: assessmentCandidate.issueKey,
                errorType: error instanceof Error ? error.name : typeof error,
                failureCode: error instanceof ClassificationAttemptError
                  ? error.failureCode
                  : 'unexpected_error',
              }, 'Known issue assessment failed');
            }
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

function emptyExtractedIssues(): ExtractedVehicleIssues {
  return { mechanical: [], bodywork: [], interior: [], other: [] };
}

function extractedIssueCount(issues: ExtractedVehicleIssues): number {
  return issues.mechanical.length + issues.bodywork.length + issues.interior.length + issues.other.length;
}
