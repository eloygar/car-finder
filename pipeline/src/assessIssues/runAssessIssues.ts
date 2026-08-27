import type { BatchLogger } from '../search.js';
import type { ClassifierSession } from '../classify/types.js';
import { ClassificationAttemptError, ISSUE_ASSESSMENT_VERSION } from '../classify/types.js';
import type { AssessIssuesRunOptions, AssessIssuesSummary, IssueAssessmentRepository } from './types.js';

export async function runAssessIssues(options: {
  run: AssessIssuesRunOptions;
  repository: IssueAssessmentRepository;
  createSession?: () => Promise<ClassifierSession>;
  logger: BatchLogger;
  now?: () => Date;
}): Promise<AssessIssuesSummary> {
  const candidates = await options.repository.findCandidates(options.run);
  const summary: AssessIssuesSummary = {
    assessmentsSelected: candidates.length, assessed: 0, assessmentCached: 0,
    assessmentFailed: 0, inputTokens: 0, outputTokens: 0, dryRun: options.run.dryRun,
  };
  if (options.run.dryRun || candidates.length === 0) return summary;
  if (!options.createSession) throw new Error('Classifier session is required for a live run');
  const session = await options.createSession();
  try {
    for (const candidate of candidates) {
      try {
        const result = await session.classifier.assessIssueSeverityAndCost(candidate);
        summary.inputTokens += result.inputTokens;
        summary.outputTokens += result.outputTokens;
        await options.repository.save({
          candidate, result, analysisVersion: ISSUE_ASSESSMENT_VERSION,
          assessedAt: options.now?.() ?? new Date(),
        });
        summary.assessed += 1;
        if (candidate.cached) summary.assessmentCached += 1;
      } catch (error) {
        if (error instanceof ClassificationAttemptError) {
          summary.inputTokens += error.inputTokens;
          summary.outputTokens += error.outputTokens;
        }
        summary.assessmentFailed += 1;
        options.logger.error({
          vehicleModelId: candidate.vehicleModelId,
          issueKey: candidate.issueKey,
          errorType: error instanceof Error ? error.name : typeof error,
        }, 'Known issue assessment failed');
      }
    }
  } finally {
    await session.close();
  }
  return summary;
}
