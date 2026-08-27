import type {
  ListingClassification,
  ListingRecord,
  VehicleOperabilityClassification,
} from './types.js';

export type KnownIssuesFilter = '' | 'found' | 'none' | 'skipped';

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
  if (!isRecord(value) || !isRecord(value.operability) || !isRecord(value.knownIssuesWeb)) {
    return null;
  }
  if (!asOperabilityClassification(value.operability as ListingRecord['classification'])) return null;
  const knownIssues = value.knownIssuesWeb;
  if (knownIssues.status === 'skipped') {
    if (knownIssues.reason !== 'non_operational') return null;
  } else if (knownIssues.status === 'completed') {
    if (
      typeof knownIssues.found !== 'boolean'
      || typeof knownIssues.summary !== 'string'
      || !Array.isArray(knownIssues.sources)
      || !knownIssues.sources.every(isSource)
    ) return null;
  } else return null;
  return value as unknown as ListingClassification;
}

export function matchesKnownIssuesFilter(
  value: ListingRecord['classification'],
  filter: KnownIssuesFilter,
): boolean {
  if (!filter) return true;
  const knownIssues = asListingClassification(value)?.knownIssuesWeb;
  if (!knownIssues) return false;
  if (filter === 'skipped') return knownIssues.status === 'skipped';
  return knownIssues.status === 'completed'
    && knownIssues.found === (filter === 'found');
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
