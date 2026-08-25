export interface MappedListing {
  externalId: string;
  provider: 'wallapop';
  title: string;
  description: string | null;
  price: string;
  brand: string;
  model: string;
  year: number | null;
  mileage: number | null;
  fuelType: string | null;
  transmission: string | null;
  power: number | null;
  bodyType: string | null;
  province: string | null;
  latitude: number | null;
  longitude: number | null;
  url: string;
  images: string[];
  publishedAt: Date | null;
  sellerType: string | null;
  sellerName: string | null;
  rawPayload: Record<string, unknown>;
}

export interface PreparedListing extends MappedListing {
  contentHash: string;
}

export interface ExistingListingState {
  externalId: string;
  contentHash: string;
  status: string;
}

export type ReconciliationAction =
  | { kind: 'create'; listing: PreparedListing }
  | {
      kind: 'update';
      listing: PreparedListing;
      classificationChanged: boolean;
    };

export interface ReconciliationRepository {
  findExisting(externalIds: readonly string[]): Promise<readonly ExistingListingState[]>;
  apply(actions: readonly ReconciliationAction[], seenAt: Date): Promise<void>;
}

export interface ReconcileSummary {
  total: number;
  created: number;
  changed: number;
  unchanged: number;
  reactivated: number;
  dryRun: boolean;
}
