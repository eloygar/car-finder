import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  classifiedSearchFormFromUrl,
  classifiedSearchPageFromUrl,
  classifiedSearchUrlFromForm,
  RankedListingCard,
  RankingBreakdown,
} from './ClassifiedListingsSearchPage.js';
import type { ListingRanking, ListingRecord } from './types.js';

const ranking: ListingRanking = {
  score: 82,
  distanceKm: 24.6,
  version: 'v1',
  breakdown: [
    { factor: 'base', delta: 50, reason: 'Anuncio elegible.' },
    { factor: 'price', delta: 20, reason: 'Está por debajo del máximo objetivo.' },
    { factor: 'mileage', delta: 15, reason: 'Tiene un kilometraje favorable.' },
    { factor: 'distance', delta: 14, reason: 'Está cerca de Vigo.' },
    { factor: 'listing_issues', delta: -12, reason: 'Tiene una incidencia importante.' },
    { factor: 'model_issues', delta: -5, reason: 'Hay problemas generales conocidos.' },
  ],
};

describe('classified listing recommendation presentation', () => {
  it('shows score, position, distance, repair range, and only two principal reasons', () => {
    const html = renderToStaticMarkup(<RankedListingCard listing={listing()} ranking={ranking} position={3} />);
    expect(html).toContain('82');
    expect(html).toContain('/100');
    expect(html).toContain('#3');
    expect(html).toContain('24,6 km de Vigo');
    expect(html).toContain('(+ 300–600 €)');
    expect(html).toContain('Está por debajo del máximo objetivo.');
    expect(html).toContain('Tiene un kilometraje favorable.');
    expect(html).not.toContain('Está cerca de Vigo.');
    expect(html).toContain('Ver análisis completo');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it('renders every Spanish scoring reason in the complete breakdown', () => {
    const html = renderToStaticMarkup(<RankingBreakdown ranking={ranking} />);
    expect(html).toContain('Desglose de puntuación · v1');
    expect(html).toContain('Elegibilidad');
    expect(html).toContain('Incidencias del anuncio');
    expect(html).toContain('Problemas del modelo');
    for (const entry of ranking.breakdown) expect(html).toContain(entry.reason);
  });

  it('hides listing repair assessment data when its feature is disabled', () => {
    const html = renderToStaticMarkup(
      <RankedListingCard
        listing={listing()}
        ranking={ranking}
        position={1}
        listingIssueAssessmentsEnabled={false}
      />,
    );
    expect(html).not.toContain('(+ 300–600 €)');
  });

  it('round-trips a shareable search URL and normalizes invalid pages', () => {
    const form = {
      brand: 'Toyota', vehicleModelId: 'model-id', priceTargetMax: '15000',
      mileageTargetMax: '150000', locationId: 'vigo' as const,
    };
    const params = classifiedSearchUrlFromForm(form, 3);
    expect(classifiedSearchFormFromUrl(params)).toEqual(form);
    expect(classifiedSearchPageFromUrl(params)).toBe(3);
    expect(classifiedSearchPageFromUrl(new URLSearchParams('page=-2'))).toBe(1);
    expect(classifiedSearchUrlFromForm(form, 1).has('page')).toBe(false);
  });
});

function listing(): ListingRecord {
  return {
    id: 'listing-1', externalId: 'external-1', provider: 'wallapop', title: 'Toyota Corolla recomendado',
    description: 'Buen estado.', price: 12_500, brand: 'Toyota', model: 'Corolla', year: 2020,
    mileage: 70_000, fuelType: 'hybrid', transmission: 'automatic', power: 122, bodyType: 'sedan',
    province: 'Pontevedra', latitude: 42.24, longitude: -8.72, url: 'https://example.test/listing',
    images: ['https://example.test/car.jpg'], publishedAt: null, sellerType: null, sellerName: null,
    status: 'active', contentHash: 'hash', firstSeenAt: '2026-08-27T10:00:00Z',
    lastSeenAt: '2026-08-27T10:00:00Z', rawPayload: null,
    classification: {
      operability: { status: 'operational', confidence: 'high', evidence: [], reason: 'El coche funciona.' },
    },
    classificationVersion: 'v5-operability-listing-issues', classifiedAt: '2026-08-27T10:00:00Z',
    knownModelIssues: null,
    listingIssueExtraction: {
      extractedAt: '2026-08-27T10:00:00Z',
      issues: [{
        category: 'mechanical', description: 'Pierde aceite.', evidence: ['pierde aceite'],
        assessment: {
          severity: 'high', estimatedCostMinEUR: 300, estimatedCostMaxEUR: 600,
          reasoning: 'Debe repararse.', sources: [{ title: 'Taller', url: 'https://example.test/taller' }],
          pricingYear: 2026, assessedAt: '2026-08-27T10:00:00Z',
        },
      }],
    },
  };
}
