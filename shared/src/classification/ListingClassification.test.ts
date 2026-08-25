import { describe, expect, it } from 'vitest';

import { parseListingClassification } from './ListingClassification.js';

describe('ListingClassification', () => {
  it('validates stable classifier fields and preserves future tool output', () => {
    const value = {
      isDamaged: false,
      damageConfidence: 'high',
      repairCost: { estimate: 'none', reasoning: 'No visible damage.' },
      knownIssues: { found: true, detail: 'Recall data was returned.' },
      toolResults: { estimate_market_price: { average: '12000.00' } },
      futureAnalysis: { score: 0.9 },
    };

    expect(parseListingClassification(value)).toEqual(value);
  });

  it('rejects incomplete or invalid stable fields', () => {
    expect(() => parseListingClassification({ isDamaged: true })).toThrow();
    expect(() => parseListingClassification({
      isDamaged: true,
      damageConfidence: 'certain',
      repairCost: { estimate: 'unknown', reasoning: '' },
      knownIssues: { found: false, detail: null },
    })).toThrow();
  });
});
