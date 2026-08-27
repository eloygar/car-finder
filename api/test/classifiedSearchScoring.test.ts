import { describe, expect, it } from 'vitest';

import { haversineDistanceKm, scoreClassifiedListing } from '../src/classifiedSearch/scoring.js';
import type { ListingScoringInput, RankingFactor } from '../src/classifiedSearch/types.js';
import { VIGO_LOCATION } from '../src/classifiedSearch/types.js';
import { KNOWN_MODEL_ISSUES_VERSION } from '../../shared/src/knownModelIssues.js';

const search = { priceTargetMax: 15_000, mileageTargetMax: 150_000 };
const base: ListingScoringInput = {
  price: 15_000,
  mileage: 150_000,
  latitude: null,
  longitude: null,
  listingIssueExtraction: null,
  knownModelIssues: null,
};

describe('classified listing scoring v1', () => {
  it.each([
    [0, -10],
    [999, -10],
    [13_000, 20],
    [15_000, 5],
    [17_000, -20],
  ])('scores a price of %s EUR with delta %s', (price, expected) => {
    expect(delta(scoreClassifiedListing({ ...base, price }, search), 'price')).toBe(expected);
  });

  it.each([
    [null, 0],
    [0, 0],
    [70_000, 15],
    [160_000, 3],
    [170_000, 1],
    [250_000, -15],
  ])('scores mileage %s with delta %s', (mileage, expected) => {
    expect(delta(scoreClassifiedListing({ ...base, mileage }, search), 'mileage')).toBe(expected);
  });

  it('uses Haversine distance and keeps missing coordinates neutral', () => {
    expect(haversineDistanceKm(
      VIGO_LOCATION.latitude,
      VIGO_LOCATION.longitude,
      VIGO_LOCATION.latitude,
      VIGO_LOCATION.longitude,
    )).toBe(0);
    expect(delta(scoreClassifiedListing({ ...base }, search), 'distance')).toBe(0);
    expect(delta(scoreAtApproximateDistance(0), 'distance')).toBe(15);
    expect(delta(scoreAtApproximateDistance(100), 'distance')).toBe(10);
    expect(delta(scoreAtApproximateDistance(300), 'distance')).toBe(0);
    expect(delta(scoreAtApproximateDistance(600), 'distance')).toBe(-15);
  });

  it('penalizes only the issue count, ignores severity, and caps the penalty at 15 points', () => {
    const ranking = scoreClassifiedListing({
      ...base,
      listingIssueExtraction: {
        issues: [
          { assessment: { severity: 'low' } },
          { assessment: { severity: 'medium' } },
          { assessment: { severity: 'high' } },
          { assessment: { severity: 'critical' } },
          { assessment: null },
        ],
      },
    }, search);
    expect(delta(ranking, 'listing_issues')).toBe(-5);
    expect(ranking.breakdown.find(({ factor }) => factor === 'listing_issues')?.reason)
      .toContain('sin considerar su gravedad');
    expect(delta(scoreClassifiedListing({
      ...base,
      listingIssueExtraction: { issues: Array.from({ length: 20 }, () => ({ assessment: null })) },
    }, search), 'listing_issues')).toBe(-15);
  });

  it('does not reward absent or empty listing issue data', () => {
    expect(delta(scoreClassifiedListing(base, search), 'listing_issues')).toBe(0);
    expect(delta(scoreClassifiedListing({
      ...base, listingIssueExtraction: { issues: [] },
    }, search), 'listing_issues')).toBe(0);
  });

  it('only penalizes current Spanish model research and caps it at five points', () => {
    const eleven = Array.from({ length: 11 }, (_, index) => `Incidencia ${index}`);
    const current = { analysisVersion: KNOWN_MODEL_ISSUES_VERSION, mechanical: eleven, bodywork: [], interior: [], other: [] };
    const legacy = { ...current, analysisVersion: 'v1-categorized' };
    expect(delta(scoreClassifiedListing({ ...base, knownModelIssues: current }, search), 'model_issues')).toBe(-5);
    expect(delta(scoreClassifiedListing({ ...base, knownModelIssues: legacy }, search), 'model_issues')).toBe(0);
    expect(delta(scoreClassifiedListing(base, search), 'model_issues')).toBe(0);
  });

  it('returns an integer score equal to the clamped breakdown sum', () => {
    const best = scoreClassifiedListing({
      ...base,
      price: 10_000,
      mileage: 20_000,
      latitude: VIGO_LOCATION.latitude,
      longitude: VIGO_LOCATION.longitude,
      listingIssueExtraction: { issues: [] },
    }, search);
    expect(best.score).toBe(100);
    expect(best.score).toBe(best.breakdown.reduce((sum, entry) => sum + entry.delta, 0));

    const worst = scoreClassifiedListing({
      ...base,
      price: 30_000,
      mileage: 500_000,
      latitude: VIGO_LOCATION.latitude + 10,
      longitude: VIGO_LOCATION.longitude,
      listingIssueExtraction: { issues: Array.from({ length: 20 }, () => ({ assessment: { severity: 'critical' } })) },
      knownModelIssues: {
        analysisVersion: KNOWN_MODEL_ISSUES_VERSION,
        mechanical: Array.from({ length: 10 }, (_, index) => `Fallo ${index}`),
        bodywork: [], interior: [], other: [],
      },
    }, search);
    expect(worst.score).toBe(0);
    expect(worst.breakdown.every(({ reason }) => reason.length > 0)).toBe(true);
  });
});

function delta(ranking: ReturnType<typeof scoreClassifiedListing>, factor: RankingFactor): number {
  return ranking.breakdown.find((entry) => entry.factor === factor)!.delta;
}

function scoreAtApproximateDistance(distanceKm: number) {
  return scoreClassifiedListing({
    ...base,
    latitude: VIGO_LOCATION.latitude + distanceKm / 111.195,
    longitude: VIGO_LOCATION.longitude,
  }, search);
}
