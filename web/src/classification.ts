import type {
  ListingClassification,
  ListingRecord,
  KnownModelIssues,
  VehicleOperabilityClassification,
} from './types.js';

export type KnownIssuesFilter = '' | 'found' | 'none' | 'pending';

export function asOperabilityClassification(
  value: ListingRecord['classification'],
): VehicleOperabilityClassification | null {
  if (!isRecord(value)) return null;
  const nested = value.operability;
  const candidate = isRecord(nested) ? nested : value;
  if (
    !isOperabilityStatus(candidate.status)
    || !isConfidence(candidate.confidence)
    || !Array.isArray(candidate.evidence)
    || !candidate.evidence.every((entry) => typeof entry === 'string')
    || typeof candidate.reason !== 'string'
  ) return null;
  return candidate as unknown as VehicleOperabilityClassification;
}

export function asListingClassification(
  value: ListingRecord['classification'],
): ListingClassification | null {
  if (!isRecord(value) || !isRecord(value.operability)) return null;
  if (!asOperabilityClassification(value.operability as ListingRecord['classification'])) return null;
  return value as unknown as ListingClassification;
}

export function matchesKnownIssuesFilter(
  value: KnownModelIssues | null,
  filter: KnownIssuesFilter,
): boolean {
  if (!filter) return true;
  if (filter === 'pending') return value === null;
  return value !== null && value.hasIssues === (filter === 'found');
}

export function asKnownModelIssues(value: unknown): KnownModelIssues | null {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.year !== 'number'
    || typeof value.hasIssues !== 'boolean'
    || typeof value.researchedAt !== 'string'
    || !isStringArray(value.mechanical)
    || !isStringArray(value.bodywork)
    || !isStringArray(value.interior)
    || !isStringArray(value.other)
    || !Array.isArray(value.sources)
    || !value.sources.every(isSource)
    || !Array.isArray(value.issueAssessments)
    || !value.issueAssessments.every(isIssueAssessmentEntry)) return null;
  return value as unknown as KnownModelIssues;
}

function isIssueAssessmentEntry(value: unknown): boolean {
  if (!isRecord(value)
    || typeof value.issue !== 'string'
    || !isIssueCategory(value.category)) return false;
  if (value.assessment === null) return true;
  const assessment = value.assessment;
  return isRecord(assessment)
    && isSeverity(assessment.severity)
    && typeof assessment.estimatedCostMinEUR === 'number'
    && typeof assessment.estimatedCostMaxEUR === 'number'
    && assessment.estimatedCostMinEUR >= 0
    && assessment.estimatedCostMaxEUR >= assessment.estimatedCostMinEUR
    && typeof assessment.reasoning === 'string'
    && typeof assessment.pricingYear === 'number'
    && typeof assessment.assessedAt === 'string'
    && Array.isArray(assessment.sources)
    && assessment.sources.every(isSource);
}

function isIssueCategory(value: unknown): boolean {
  return value === 'mechanical' || value === 'bodywork' || value === 'interior' || value === 'other';
}

function isSeverity(value: unknown): boolean {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSource(value: unknown): boolean {
  return isRecord(value)
    && typeof value.title === 'string'
    && typeof value.url === 'string'
    && isHttpUrl(value.url);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isOperabilityStatus(value: unknown): value is VehicleOperabilityClassification['status'] {
  return value === 'operational' || value === 'non_operational' || value === 'unknown';
}

function isConfidence(value: unknown): value is VehicleOperabilityClassification['confidence'] {
  return value === 'low' || value === 'medium' || value === 'high';
}
