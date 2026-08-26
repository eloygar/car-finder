import type { ListingClassification } from '../../../shared/src/classification/ListingClassification.js';

export const CLASSIFICATION_VERSION = 'v2-operability';
export const DEFAULT_CLASSIFICATION_MODEL = 'claude-sonnet-4-5';

export interface ClassificationRunOptions {
  all: boolean;
  dryRun: boolean;
  force: boolean;
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
  dryRun: boolean;
  version: string;
}

export interface ClassificationRepository {
  findCandidates(options: ClassificationRunOptions, version: string): Promise<ClassificationCandidate[]>;
  saveClassification(options: {
    id: string;
    contentHash: string;
    classification: ListingClassification;
    version: string;
    classifiedAt: Date;
  }): Promise<boolean>;
}

export interface ListingClassificationResult {
  classification: ListingClassification;
  inputTokens: number;
  outputTokens: number;
}

export class ClassificationAttemptError extends Error {
  constructor(
    message: string,
    readonly inputTokens: number,
    readonly outputTokens: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ClassificationAttemptError';
  }
}

export interface ListingClassifier {
  classify(candidate: ClassificationCandidate): Promise<ListingClassificationResult>;
}

export interface ClassifierSession {
  classifier: ListingClassifier;
  close(): Promise<void>;
}
