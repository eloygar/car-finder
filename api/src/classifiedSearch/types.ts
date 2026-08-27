import { z } from 'zod';

export const CLASSIFIED_SEARCH_SCORING_VERSION = 'v1';
export const VIGO_LOCATION = {
  id: 'vigo',
  label: 'Vigo',
  latitude: 42.2406,
  longitude: -8.7207,
} as const;

export const classifiedListingSearchSchema = z.strictObject({
  vehicleModelId: z.string().uuid(),
  priceTargetMax: z.number().finite().positive(),
  mileageTargetMax: z.number().finite().positive(),
  locationId: z.literal(VIGO_LOCATION.id),
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type ClassifiedListingSearch = z.infer<typeof classifiedListingSearchSchema>;
export type RankingFactor =
  | 'base'
  | 'price'
  | 'mileage'
  | 'distance'
  | 'listing_issues'
  | 'model_issues';

export interface RankingBreakdownEntry {
  factor: RankingFactor;
  delta: number;
  reason: string;
}

export interface ListingRanking {
  score: number;
  distanceKm: number | null;
  breakdown: RankingBreakdownEntry[];
  version: typeof CLASSIFIED_SEARCH_SCORING_VERSION;
}

export interface ListingScoringInput {
  price: number;
  mileage: number | null;
  latitude: number | null;
  longitude: number | null;
  listingIssueExtraction: null | {
    issues: unknown[];
  };
  knownModelIssues: null | {
    analysisVersion: string;
    mechanical: string[];
    bodywork: string[];
    interior: string[];
    other: string[];
  };
}
