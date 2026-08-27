import { describe, expect, it } from 'vitest';

import {
  asListingClassification,
  asOperabilityClassification,
  matchesKnownIssuesFilter,
} from './classification.js';

const operability = {
  status: 'operational' as const,
  confidence: 'high' as const,
  evidence: ['Se usa a diario'],
  reason: 'El vendedor indica que se utiliza a diario.',
};

describe('classification UI model', () => {
  it('supports current and legacy operability shapes', () => {
    expect(asOperabilityClassification(operability)).toEqual(operability);
    expect(asOperabilityClassification({
      operability,
      knownIssuesWeb: { status: 'skipped', reason: 'non_operational' },
    })).toEqual(operability);
  });

  it.each([
    ['found', { status: 'completed', found: true, summary: 'Hay incidencias.', sources: [] }],
    ['none', { status: 'completed', found: false, summary: 'No se encontraron incidencias.', sources: [] }],
    ['skipped', { status: 'skipped', reason: 'non_operational' }],
  ] as const)('matches the %s known-issues state', (filter, knownIssuesWeb) => {
    const value = { operability, knownIssuesWeb };
    expect(asListingClassification(value)).not.toBeNull();
    expect(matchesKnownIssuesFilter(value, filter)).toBe(true);
  });

  it('rejects incomplete current classifications and excludes legacy data from issue filters', () => {
    expect(asListingClassification({ operability })).toBeNull();
    expect(asListingClassification({
      operability,
      knownIssuesWeb: {
        status: 'completed', found: true, summary: 'Hay incidencias.',
        sources: [{ title: 'Fuente insegura', url: 'javascript:alert(1)' }],
      },
    })).toBeNull();
    expect(matchesKnownIssuesFilter(operability, 'found')).toBe(false);
  });
});
