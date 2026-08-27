import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ClassificationDetails, ClassificationSummary } from './ListingsPage.js';
import type { ListingRecord } from './types.js';

const operability = {
  status: 'operational' as const,
  confidence: 'high' as const,
  evidence: ['Se usa a diario'],
  reason: 'El vendedor indica que se utiliza a diario.',
};

describe('listing classification presentation', () => {
  it.each([
    [true, 'Problemas conocidos'],
    [false, 'Sin problemas conocidos'],
  ] as const)('renders the completed issues badge and compact summary for found=%s', (found, label) => {
    const html = renderToStaticMarkup(<ClassificationSummary item={listing({
      operability,
      knownIssuesWeb: {
        status: 'completed', found,
        summary: 'Resumen de incidencias suficientemente largo para la tarjeta.',
        sources: [],
      },
    })} />);

    expect(html).toContain(label);
    expect(html).toContain('known-issues-preview');
  });

  it('renders skipped and legacy states', () => {
    const skipped = renderToStaticMarkup(<ClassificationSummary item={listing({
      operability: { ...operability, status: 'non_operational' },
      knownIssuesWeb: { status: 'skipped', reason: 'non_operational' },
    })} />);
    const legacy = renderToStaticMarkup(<ClassificationSummary item={listing(operability)} />);

    expect(skipped).toContain('Búsqueda omitida');
    expect(legacy).toContain('Versión anterior');
  });

  it('renders safe external sources and the model-level disclaimer in details', () => {
    const html = renderToStaticMarkup(<ClassificationDetails item={listing({
      operability,
      knownIssuesWeb: {
        status: 'completed', found: true, summary: 'Hay una incidencia documentada.',
        sources: [{ title: 'NHTSA recall', url: 'https://www.nhtsa.gov/recalls' }],
      },
    })} />);

    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('no implican que esta unidad concreta esté afectada');
  });

  it('renders an unclassified state when no classification exists', () => {
    const html = renderToStaticMarkup(<ClassificationSummary item={listing(null, false)} />);
    expect(html).toContain('Sin clasificar');
  });
});

function listing(classification: ListingRecord['classification'], classified = true): ListingRecord {
  return {
    id: 'db-1', externalId: 'external-1', provider: 'wallapop', title: 'Toyota Corolla',
    description: null, price: 10_000, brand: 'Toyota', model: 'Corolla', year: 2020,
    mileage: null, fuelType: null, transmission: null, power: null, bodyType: null,
    province: null, latitude: null, longitude: null, url: 'https://example.test/listing',
    images: [], publishedAt: null, sellerType: null, sellerName: null, status: 'active',
    contentHash: 'hash', firstSeenAt: '2026-08-27T10:00:00Z', lastSeenAt: '2026-08-27T10:00:00Z',
    rawPayload: null, classification,
    classificationVersion: classified ? 'v3-operability-web-issues' : null,
    classifiedAt: classified ? '2026-08-27T10:00:00Z' : null,
  };
}
