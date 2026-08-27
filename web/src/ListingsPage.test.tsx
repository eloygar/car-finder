import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClassificationDetails, ClassificationSummary } from './ListingsPage.js';
import type { KnownModelIssues, ListingRecord } from './types.js';

const operability = {
  status: 'operational' as const, confidence: 'high' as const,
  evidence: ['Se usa a diario'], reason: 'El vendedor indica que se utiliza a diario.',
};
const issues: KnownModelIssues = {
  id: 'issues-1', year: 2020, mechanical: ['Fallo conocido de la bomba de agua.'], bodywork: [],
  interior: ['Reinicio ocasional del infoentretenimiento.'], other: [], hasIssues: true,
  sources: [{ title: 'NHTSA recall', url: 'https://www.nhtsa.gov/recalls' }],
  researchedAt: '2026-08-27T10:00:00Z',
};

describe('listing classification presentation', () => {
  it('renders found, none and pending badges', () => {
    expect(renderToStaticMarkup(<ClassificationSummary item={listing(issues)} />)).toContain('Problemas conocidos');
    expect(renderToStaticMarkup(<ClassificationSummary item={listing({
      ...issues, hasIssues: false, mechanical: [], interior: [],
    })} />)).toContain('Sin problemas conocidos');
    expect(renderToStaticMarkup(<ClassificationSummary item={listing(null)} />)).toContain('Sin investigar');
  });

  it('renders categories, safe external sources and the model-year disclaimer', () => {
    const html = renderToStaticMarkup(<ClassificationDetails item={listing(issues)} />);
    expect(html).toContain('Mecánica');
    expect(html).toContain('Interior');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('modelo-año');
  });

  it('renders legacy and unclassified states', () => {
    const legacy = listing(null);
    legacy.classification = operability;
    legacy.classificationVersion = 'v2-operability';
    expect(renderToStaticMarkup(<ClassificationSummary item={legacy} />)).toContain('Versión anterior');
    expect(renderToStaticMarkup(<ClassificationSummary item={listing(null, false)} />)).toContain('Sin clasificar');
  });
});

function listing(knownModelIssues: KnownModelIssues | null, classified = true): ListingRecord {
  return {
    id: 'db-1', externalId: 'external-1', provider: 'wallapop', title: 'Toyota Corolla', description: null,
    price: 10_000, brand: 'Toyota', model: 'Corolla', year: 2020, mileage: null, fuelType: null,
    transmission: null, power: null, bodyType: null, province: null, latitude: null, longitude: null,
    url: 'https://example.test/listing', images: [], publishedAt: null, sellerType: null, sellerName: null,
    status: 'active', contentHash: 'hash', firstSeenAt: '2026-08-27T10:00:00Z',
    lastSeenAt: '2026-08-27T10:00:00Z', rawPayload: null,
    classification: classified ? { operability } : null,
    classificationVersion: classified ? 'v4-operability-model-issues' : null,
    classifiedAt: classified ? '2026-08-27T10:00:00Z' : null,
    knownModelIssues,
  };
}
