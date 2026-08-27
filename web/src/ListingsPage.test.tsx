import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ClassificationDetails, ClassificationSummary, ListingPrice } from './ListingsPage.js';
import type { KnownModelIssues, ListingIssueExtraction, ListingRecord } from './types.js';

const operability = {
  status: 'operational' as const, confidence: 'high' as const,
  evidence: ['Se usa a diario'], reason: 'El vendedor indica que se utiliza a diario.',
};
const issues: KnownModelIssues = {
  id: 'issues-1', year: 2020, mechanical: ['Fallo conocido de la bomba de agua.'], bodywork: [],
  interior: ['Reinicio ocasional del infoentretenimiento.'], other: [], hasIssues: true,
  sources: [{ title: 'NHTSA recall', url: 'https://www.nhtsa.gov/recalls' }],
  researchedAt: '2026-08-27T10:00:00Z',
  issueAssessments: [
    {
      issue: 'Fallo conocido de la bomba de agua.', category: 'mechanical',
      assessment: {
        severity: 'high', estimatedCostMinEUR: 800, estimatedCostMaxEUR: 1_500,
        reasoning: 'Puede provocar sobrecalentamiento y daños graves.',
        sources: [{ title: 'Taller español', url: 'https://example.test/taller' }],
        pricingYear: 2026, assessedAt: '2026-08-27T10:00:00Z',
      },
    },
    {
      issue: 'Reinicio ocasional del infoentretenimiento.', category: 'interior', assessment: null,
    },
  ],
};
const listingIssues: ListingIssueExtraction = {
  extractedAt: '2026-08-27T10:00:00Z',
  issues: [{
    category: 'bodywork', description: 'Tiene un golpe en la puerta.', evidence: ['golpe en puerta'],
    assessment: {
      severity: 'low', estimatedCostMinEUR: 150, estimatedCostMaxEUR: 450,
      reasoning: 'Daño estético reparable.',
      sources: [{ title: 'Tarifas de chapa', url: 'https://example.test/chapa' }],
      pricingYear: 2026, assessedAt: '2026-08-27T10:00:00Z',
    },
  }, {
    category: 'mechanical', description: 'Pierde aceite.', evidence: ['pierde aceite'], assessment: null,
  }],
};

describe('listing classification presentation', () => {
  it.each([
    ['low', 'Baja'], ['medium', 'Media'], ['high', 'Alta'], ['critical', 'Crítica'],
  ] as const)('renders %s severity as %s', (severity, label) => {
    const assessed = {
      ...issues,
      issueAssessments: [{
        ...issues.issueAssessments[0]!,
        assessment: { ...issues.issueAssessments[0]!.assessment!, severity },
      }],
    };
    expect(renderToStaticMarkup(<ClassificationDetails item={listing(assessed)} />)).toContain(label);
  });

  it('renders found, none and pending badges', () => {
    expect(renderToStaticMarkup(<ClassificationSummary item={listing(issues)} />)).toContain('Problemas conocidos');
    expect(renderToStaticMarkup(<ClassificationSummary item={listing({
      ...issues, hasIssues: false, mechanical: [], interior: [], issueAssessments: [],
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
    expect(html).toContain('Alta');
    expect(html).toContain('800');
    expect(html).toContain('Evaluación pendiente');
  });

  it('hides pending model assessments when the feature is disabled but retains cached results', () => {
    const html = renderToStaticMarkup(
      <ClassificationDetails item={listing(issues)} modelIssueAssessmentsEnabled={false} />,
    );
    expect(html).not.toContain('Evaluación pendiente');
    expect(html).toContain('Alta');
    expect(html).toContain('800');
    const summary = renderToStaticMarkup(
      <ClassificationSummary item={listing(issues)} modelIssueAssessmentsEnabled={false} />,
    );
    expect(summary).not.toContain('pendiente');
    expect(summary).toContain('Gravedad máxima: Alta');
  });

  it('renders legacy and unclassified states', () => {
    const legacy = listing(null);
    legacy.classification = operability;
    legacy.classificationVersion = 'v2-operability';
    expect(renderToStaticMarkup(<ClassificationSummary item={legacy} />)).toContain('Versión anterior');
    expect(renderToStaticMarkup(<ClassificationSummary item={listing(null, false)} />)).toContain('Sin clasificar');
  });

  it('keeps listing-specific issues separate with evidence, assessment, pending state and disclaimer', () => {
    const html = renderToStaticMarkup(<ClassificationDetails item={listing(issues, true, listingIssues)} />);
    expect(html).toContain('Incidencias declaradas en el anuncio');
    expect(html).toContain('golpe en puerta');
    expect(html).toContain('Evaluación pendiente');
    expect(html).toContain('no sustituye una inspección');
    expect(html).toContain('target="_blank"');
    const summary = renderToStaticMarkup(<ClassificationSummary item={listing(issues, true, listingIssues)} />);
    expect(summary).toContain('2 incidencias del anuncio');
    expect(summary).toContain('1 pendiente');
  });

  it('renders no declared defects and not analyzed as distinct states', () => {
    expect(renderToStaticMarkup(<ClassificationDetails item={listing(issues, true, {
      extractedAt: '2026-08-27T10:00:00Z', issues: [],
    })} />)).toContain('Sin defectos declarados');
    expect(renderToStaticMarkup(<ClassificationDetails item={listing(issues)} />)).toContain('Sin analizar');
  });

  it('adds the estimated range of assessed listing repairs next to the base price', () => {
    const additionalAssessment = {
      ...listingIssues.issues[0]!.assessment!,
      estimatedCostMinEUR: 200,
      estimatedCostMaxEUR: 350,
    };
    const item = listing(issues, true, {
      ...listingIssues,
      issues: [
        ...listingIssues.issues,
        {
          category: 'interior', description: 'Tapicería dañada.', evidence: ['tapicería dañada'],
          assessment: additionalAssessment,
        },
      ],
    });

    const html = renderToStaticMarkup(<ListingPrice item={item} />);
    expect(html).toContain('10.000');
    expect(html).toContain('(+ 350–800 €)');
  });

  it('does not show a repair supplement when every listing issue is pending', () => {
    const item = listing(issues, true, {
      extractedAt: listingIssues.extractedAt,
      issues: [{
        category: 'mechanical', description: 'Pierde aceite.', evidence: ['pierde aceite'], assessment: null,
      }],
    });

    expect(renderToStaticMarkup(<ListingPrice item={item} />)).not.toContain('listing-repair-cost');
  });

  it('hides cached and pending listing assessments when their feature is disabled', () => {
    const item = listing(null, true, listingIssues);
    const price = renderToStaticMarkup(
      <ListingPrice item={item} listingIssueAssessmentsEnabled={false} />,
    );
    const summary = renderToStaticMarkup(
      <ClassificationSummary item={item} listingIssueAssessmentsEnabled={false} />,
    );
    const details = renderToStaticMarkup(
      <ClassificationDetails item={item} listingIssueAssessmentsEnabled={false} />,
    );
    expect(price).not.toContain('listing-repair-cost');
    expect(summary).toContain('2 incidencias del anuncio');
    expect(summary).not.toContain('Gravedad máxima');
    expect(summary).not.toContain('pendiente');
    expect(details).toContain('Pierde aceite.');
    expect(details).toContain('golpe en puerta');
    expect(details).not.toContain('150');
    expect(details).not.toContain('Evaluación pendiente');
    expect(details).not.toContain('Daño estético reparable');
  });
});

function listing(
  knownModelIssues: KnownModelIssues | null,
  classified = true,
  listingIssueExtraction: ListingIssueExtraction | null = null,
): ListingRecord {
  return {
    id: 'db-1', externalId: 'external-1', provider: 'wallapop', title: 'Toyota Corolla', description: null,
    price: 10_000, brand: 'Toyota', model: 'Corolla', year: 2020, mileage: null, fuelType: null,
    transmission: null, power: null, bodyType: null, province: null, latitude: null, longitude: null,
    url: 'https://example.test/listing', images: [], publishedAt: null, sellerType: null, sellerName: null,
    status: 'active', contentHash: 'hash', firstSeenAt: '2026-08-27T10:00:00Z',
    lastSeenAt: '2026-08-27T10:00:00Z', rawPayload: null,
    classification: classified ? { operability } : null,
    classificationVersion: classified ? 'v5-operability-listing-issues' : null,
    classifiedAt: classified ? '2026-08-27T10:00:00Z' : null,
    knownModelIssues,
    listingIssueExtraction,
  };
}
