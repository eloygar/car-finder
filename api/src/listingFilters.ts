export interface ListingFacetQuery {
  status?: string;
  brand?: string;
  classification?: string;
  operability?: string;
  knownIssues?: string;
}

export function buildListingFacetWhere(query: ListingFacetQuery): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const classificationConditions: Array<Record<string, unknown>> = [];
  if (query.status) where.status = query.status;
  if (query.brand) where.brand = query.brand;
  if (query.classification === 'classified') where.classifiedAt = { not: null };
  else if (query.classification === 'unclassified') where.classifiedAt = null;

  if (isOperability(query.operability)) {
    classificationConditions.push({
      OR: [
        { classification: { path: ['operability', 'status'], equals: query.operability } },
        { classification: { path: ['status'], equals: query.operability } },
      ],
    });
  }
  if (query.knownIssues === 'found' || query.knownIssues === 'none') {
    classificationConditions.push({
      knownModelIssues: { is: { hasIssues: query.knownIssues === 'found' } },
    });
  } else if (query.knownIssues === 'pending') {
    classificationConditions.push({ knownModelIssuesId: null });
  }
  if (classificationConditions.length > 0) where.AND = classificationConditions;
  return where;
}

function isOperability(value: string | undefined): value is 'operational' | 'non_operational' | 'unknown' {
  return value === 'operational' || value === 'non_operational' || value === 'unknown';
}
