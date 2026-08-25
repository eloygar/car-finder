import type {
  CheckKnownIssuesResult,
  KnownIssueSeverity,
  McpToolRepository,
  VehicleQuery,
} from './types.js';

export async function checkKnownIssues(
  query: VehicleQuery,
  repository: McpToolRepository,
): Promise<CheckKnownIssuesResult> {
  const issues = await repository.findKnownIssues(normalizeQuery(query));

  return {
    hasKnownIssues: issues.length > 0,
    issues: issues.map((issue) => ({
      id: issue.id,
      description: issue.issueDescription,
      severity: normalizeSeverity(issue.severity),
      yearFrom: issue.yearFrom,
      yearTo: issue.yearTo,
      sourceUrl: issue.source,
    })),
  };
}

function normalizeQuery(query: VehicleQuery): VehicleQuery {
  return {
    brand: query.brand.trim(),
    model: query.model.trim(),
    ...(query.year === undefined ? {} : { year: query.year }),
  };
}

function normalizeSeverity(value: string): KnownIssueSeverity {
  const normalized = value.trim().toLowerCase();
  return normalized === 'low' || normalized === 'medium' || normalized === 'high'
    ? normalized
    : 'unknown';
}
