import { describe, expect, it } from 'vitest';
import { asKnownModelIssues, asListingClassification, asOperabilityClassification, matchesKnownIssuesFilter } from './classification.js';

const operability = {
  status: 'operational' as const, confidence: 'high' as const,
  evidence: ['Se usa a diario'], reason: 'El vendedor indica que se utiliza a diario.',
};
const issues = {
  id: 'issues-1', year: 2020, mechanical: ['Fallo de bomba.'], bodywork: [], interior: [], other: [],
  sources: [{ title: 'Fuente', url: 'https://example.test/source' }], hasIssues: true,
  researchedAt: '2026-08-27T10:00:00Z',
  issueAssessments: [{ issue: 'Fallo de bomba.', category: 'mechanical' as const, assessment: null }],
};

describe('classification UI model', () => {
  it('supports v4 and legacy operability shapes', () => {
    expect(asOperabilityClassification(operability)).toEqual(operability);
    expect(asOperabilityClassification({ operability })).toEqual(operability);
    expect(asListingClassification({ operability })).toEqual({ operability });
  });

  it('matches relational known-issues states', () => {
    expect(matchesKnownIssuesFilter(issues, 'found')).toBe(true);
    expect(matchesKnownIssuesFilter({
      ...issues, hasIssues: false, mechanical: [], issueAssessments: [],
    }, 'none')).toBe(true);
    expect(matchesKnownIssuesFilter(null, 'pending')).toBe(true);
  });

  it('rejects unsafe sources and malformed relational data', () => {
    expect(asKnownModelIssues(issues)).toEqual(issues);
    expect(asKnownModelIssues({
      ...issues, sources: [{ title: 'Fuente insegura', url: 'javascript:alert(1)' }],
    })).toBeNull();
    expect(asKnownModelIssues({
      ...issues,
      issueAssessments: [{
        issue: 'Fallo de bomba.', category: 'mechanical',
        assessment: {
          severity: 'high', estimatedCostMinEUR: 1, estimatedCostMaxEUR: 2,
          reasoning: 'Razón.', pricingYear: 2026, assessedAt: '2026-08-27T10:00:00Z',
          sources: [{ title: 'Fuente insegura', url: 'javascript:alert(1)' }],
        },
      }],
    })).toBeNull();
    expect(matchesKnownIssuesFilter(null, 'found')).toBe(false);
  });
});
