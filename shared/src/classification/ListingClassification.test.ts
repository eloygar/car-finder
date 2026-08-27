import { describe, expect, it } from 'vitest';

import { parseListingClassification } from './ListingClassification.js';

describe('ListingClassification', () => {
  it('validates the vehicle-operability result', () => {
    const value = {
      operability: {
        status: 'operational',
        confidence: 'high',
        evidence: ['funciona perfectamente'],
        reason: 'The description explicitly says it works.',
      },
      knownIssuesWeb: {
        status: 'completed',
        found: false,
        summary: 'No documented model-level issues found.',
        sources: [],
      },
    };

    expect(parseListingClassification(value)).toEqual(value);
  });

  it('rejects incomplete or invalid stable fields', () => {
    expect(() => parseListingClassification({ status: 'operational' })).toThrow();
    expect(() => parseListingClassification({
      status: 'running',
      confidence: 'certain',
      evidence: [''],
      reason: '',
    })).toThrow();
  });
});
