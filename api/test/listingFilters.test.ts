import { describe, expect, it } from 'vitest';

import { buildListingFacetWhere } from '../src/listingFilters.js';

describe('buildListingFacetWhere', () => {
  it('supports current and legacy operability paths', () => {
    expect(buildListingFacetWhere({ operability: 'unknown' })).toEqual({
      AND: [{
        OR: [
          { classification: { path: ['operability', 'status'], equals: 'unknown' } },
          { classification: { path: ['status'], equals: 'unknown' } },
        ],
      }],
    });
  });

  it.each([
    ['found', { knownModelIssues: { is: { hasIssues: true } } }],
    ['none', { knownModelIssues: { is: { hasIssues: false } } }],
    ['pending', { knownModelIssuesId: null }],
  ] as const)('maps the %s known-issues filter', (knownIssues, condition) => {
    expect(buildListingFacetWhere({ knownIssues })).toEqual({
      AND: [condition],
    });
  });

  it('combines scalar, operability, and known-issues filters with AND', () => {
    const where = buildListingFacetWhere({
      status: 'active', brand: 'Toyota', classification: 'classified',
      operability: 'operational', knownIssues: 'found',
    });
    expect(where).toMatchObject({
      status: 'active', brand: 'Toyota', classifiedAt: { not: null },
      AND: [
        { OR: expect.any(Array) },
        { knownModelIssues: { is: { hasIssues: true } } },
      ],
    });
  });
});
