import type { ListingClassification } from '../../../shared/src/classification/ListingClassification.js';

import type {
  IssueSeverityAndCostAssessment,
  KnownIssuesWebAnalysis,
} from '../../../mcp-server/src/tools/types.js';

export const CLASSIFICATION_VERSION = 'v4-operability-model-issues';
export const KNOWN_MODEL_ISSUES_VERSION = 'v1-categorized';
export const ISSUE_ASSESSMENT_VERSION = 'v1-spain-mixed-cost';

export interface ClassificationRunOptions {
  all: boolean;
  dryRun: boolean;
  force: boolean;
  refreshKnownIssues: boolean;
  limit?: number;
  only?: string;
}

export interface ClassificationCandidate {
  id: string;
  externalId: string;
  contentHash: string;
  title: string;
  description: string | null;
  price: string;
  brand: string;
  model: string;
  year: number | null;
  mileage: number | null;
  fuelType: string | null;
  transmission: string | null;
  bodyType: string | null;
  images: string[];
}

export interface ClassificationSummary {
  selected: number;
  classified: number;
  failed: number;
  stale: number;
  inputTokens: number;
  outputTokens: number;
  assessmentsSelected: number;
  assessed: number;
  assessmentCached: number;
  assessmentFailed: number;
  dryRun: boolean;
  version: string;
}

export interface ClassificationRepository {
  findCandidates(options: ClassificationRunOptions, version: string): Promise<ClassificationCandidate[]>;
  findKnownModelIssues(candidate: ClassificationCandidate): Promise<boolean>;
  findIssueAssessmentCandidates(candidate: ClassificationCandidate): Promise<IssueAssessmentCandidate[]>;
  saveIssueAssessment(options: {
    candidate: IssueAssessmentCandidate;
    assessment: IssueSeverityAndCostAssessment;
    pricingYear: number;
    anthropicModel: string;
    analysisVersion: string;
    assessedAt: Date;
  }): Promise<void>;
  saveClassification(options: {
    candidate: ClassificationCandidate;
    classification: ListingClassification;
    version: string;
    classifiedAt: Date;
    researchedIssues?: {
      analysis: KnownIssuesWebAnalysis;
      anthropicModel: string;
      analysisVersion: string;
    };
  }): Promise<boolean>;
}

export interface ListingClassificationResult {
  operability: ListingClassification['operability'];
  inputTokens: number;
  outputTokens: number;
}

export interface KnownIssuesResearchResult {
  analysis: KnownIssuesWebAnalysis;
  anthropicModel: string;
  inputTokens: number;
  outputTokens: number;
}

export interface IssueAssessmentCandidate {
  vehicleModelId: string;
  brand: string;
  model: string;
  issue: string;
  issueKey: string;
  cached: boolean;
}

export interface IssueAssessmentResult {
  assessment: IssueSeverityAndCostAssessment;
  pricingYear: number;
  anthropicModel: string;
  inputTokens: number;
  outputTokens: number;
}

export class ClassificationAttemptError extends Error {
  constructor(
    message: string,
    readonly inputTokens: number,
    readonly outputTokens: number,
    readonly failureCode: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ClassificationAttemptError';
  }
}

export interface ListingClassifier {
  classifyOperability(candidate: ClassificationCandidate): Promise<ListingClassificationResult>;
  researchKnownIssues(candidate: ClassificationCandidate): Promise<KnownIssuesResearchResult>;
  assessIssueSeverityAndCost(candidate: IssueAssessmentCandidate): Promise<IssueAssessmentResult>;
}

export interface ClassifierSession {
  classifier: ListingClassifier;
  close(): Promise<void>;
}
