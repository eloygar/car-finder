import type { IssueAssessmentCandidate, IssueAssessmentResult } from '../classify/types.js';

export interface AssessIssuesRunOptions {
  all: boolean;
  dryRun: boolean;
  force: boolean;
  limit?: number;
}

export interface AssessIssuesSummary {
  assessmentsSelected: number;
  assessed: number;
  assessmentCached: number;
  assessmentFailed: number;
  inputTokens: number;
  outputTokens: number;
  dryRun: boolean;
}

export interface IssueAssessmentRepository {
  findCandidates(options: AssessIssuesRunOptions): Promise<IssueAssessmentCandidate[]>;
  save(options: {
    candidate: IssueAssessmentCandidate;
    result: IssueAssessmentResult;
    analysisVersion: string;
    assessedAt: Date;
  }): Promise<void>;
}
