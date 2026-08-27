import { describe, expect, it } from 'vitest';
import { issueKey, normalizeIssueText } from './modelIssueAssessment.js';

describe('model issue assessment identity', () => {
  it('normalizes Unicode, whitespace, and Spanish casing deterministically', () => {
    expect(normalizeIssueText('  FALLO   de BOMBA. ')).toBe('fallo de bomba.');
    expect(issueKey('FALLO  de bomba.')).toBe(issueKey(' fallo de BOMBA. '));
  });

  it('treats even a small wording change as a new issue', () => {
    expect(issueKey('Fallo de bomba.')).not.toBe(issueKey('Fallo grave de bomba.'));
  });
});
