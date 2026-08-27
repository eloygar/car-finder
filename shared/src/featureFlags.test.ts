import { describe, expect, it } from 'vitest';

import { listingIssueAssessmentsEnabled, modelIssueAssessmentsEnabled } from './featureFlags.js';

describe('modelIssueAssessmentsEnabled', () => {
  it('is disabled by default and requires an exact true value', () => {
    expect(modelIssueAssessmentsEnabled({})).toBe(false);
    expect(modelIssueAssessmentsEnabled({ ENABLE_MODEL_ISSUE_ASSESSMENTS: 'false' })).toBe(false);
    expect(modelIssueAssessmentsEnabled({ ENABLE_MODEL_ISSUE_ASSESSMENTS: 'TRUE' })).toBe(false);
    expect(modelIssueAssessmentsEnabled({ ENABLE_MODEL_ISSUE_ASSESSMENTS: 'true' })).toBe(true);
  });
});

describe('listingIssueAssessmentsEnabled', () => {
  it('is disabled unless explicitly set to lowercase true', () => {
    expect(listingIssueAssessmentsEnabled({})).toBe(false);
    expect(listingIssueAssessmentsEnabled({ ENABLE_LISTING_ISSUE_ASSESSMENTS: 'false' })).toBe(false);
    expect(listingIssueAssessmentsEnabled({ ENABLE_LISTING_ISSUE_ASSESSMENTS: 'TRUE' })).toBe(false);
    expect(listingIssueAssessmentsEnabled({ ENABLE_LISTING_ISSUE_ASSESSMENTS: 'true' })).toBe(true);
  });
});
