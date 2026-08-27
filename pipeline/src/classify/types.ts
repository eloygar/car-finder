import type { ListingClassification } from '../../../shared/src/classification/ListingClassification.js';
export { KNOWN_MODEL_ISSUES_VERSION } from '../../../shared/src/knownModelIssues.js';

import type {
  ExtractedVehicleIssues,
  IssueSeverityAndCostAssessment,
  KnownIssuesWebAnalysis,
} from '../../../mcp-server/src/tools/types.js';

export const CLASSIFICATION_VERSION = 'v5-operability-listing-issues';
export const ISSUE_ASSESSMENT_VERSION = 'v1-spain-mixed-cost';
export const LISTING_ISSUE_EXTRACTION_VERSION = 'v4-explicit-present-defects';

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
  modelIssueAssessmentsEnabled: boolean;
  listingIssueAssessmentsEnabled: boolean;
  listingIssuesDetected: number;
  listingAssessmentsSelected: number;
  listingAssessed: number;
  listingAssessmentCached: number;
  listingAssessmentFailed: number;
  dryRun: boolean;
  version: string;
}

export interface ClassificationProgress {
  current: number;
  total: number;
  externalId: string;
  status: 'success' | 'warning' | 'failed' | 'stale';
  assessmentFailures: number;
  failureCodes: string[];
}

export interface ClassificationRepository {
  findCandidates(options: ClassificationRunOptions, version: string): Promise<ClassificationCandidate[]>;
  findKnownModelIssues(candidate: ClassificationCandidate, analysisVersion: string): Promise<boolean>;
  findListingIssueExtraction(
    candidate: ClassificationCandidate,
    inputHash: string,
    analysisVersion: string,
  ): Promise<{ issueCount: number } | null>;
  findIssueAssessmentCandidates(candidate: ClassificationCandidate): Promise<IssueAssessmentCandidate[]>;
  findListingIssueAssessmentCandidates(candidate: ClassificationCandidate): Promise<ListingIssueAssessmentCandidate[]>;
  saveIssueAssessment(options: {
    candidate: IssueAssessmentCandidate;
    assessment: IssueSeverityAndCostAssessment;
    pricingYear: number;
    anthropicModel: string;
    analysisVersion: string;
    assessedAt: Date;
  }): Promise<void>;
  saveListingIssueAssessment(options: {
    candidate: ListingIssueAssessmentCandidate;
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
    listingExtraction?: {
      inputHash: string;
      issues: ExtractedVehicleIssues;
      anthropicModel: string;
      analysisVersion: string;
    };
    clearListingExtraction?: boolean;
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

export interface ListingIssueExtractionResult {
  issues: ExtractedVehicleIssues;
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

export interface ListingIssueAssessmentCandidate {
  detectedIssueId: string;
  brand: string;
  model: string;
  year?: number;
  issue: string;
  issueKey: string;
  evidence: string[];
  cached: boolean;
}

export type AssessableIssueCandidate = IssueAssessmentCandidate | ListingIssueAssessmentCandidate;

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
  extractListingIssues(candidate: ClassificationCandidate): Promise<ListingIssueExtractionResult>;
  assessIssueSeverityAndCost(candidate: AssessableIssueCandidate): Promise<IssueAssessmentResult>;
}

export interface ClassifierSession {
  classifier: ListingClassifier;
  close(): Promise<void>;
}
