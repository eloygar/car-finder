import { describe, expect, it } from 'vitest';

import { listingIssueInputHash } from './listingIssueExtraction.js';

describe('listingIssueInputHash', () => {
  it('normalizes brand/model while retaining the exact description and year', () => {
    const base = { description: 'Pierde aceite.', brand: ' Toyota ', model: 'COROLLA', year: 2020 };
    expect(listingIssueInputHash(base)).toBe(listingIssueInputHash({
      ...base, brand: 'toyota', model: ' corolla ',
    }));
    expect(listingIssueInputHash(base)).not.toBe(listingIssueInputHash({ ...base, description: 'pierde aceite.' }));
    expect(listingIssueInputHash(base)).not.toBe(listingIssueInputHash({ ...base, year: 2021 }));
  });

  it('does not depend on mutable listing fields such as price', () => {
    const input = { description: 'Golpe lateral', brand: 'Seat', model: 'León', year: null };
    expect(listingIssueInputHash(input)).toBe(listingIssueInputHash({ ...input }));
  });
});
