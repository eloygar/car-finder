export interface SelectOption {
  value: string;
  label: string;
  type: string;
}

export interface TaxonomyResponse {
  brands: string[];
  models: Record<string, string[]>;
  locations: Array<{
    id: string;
    label: string;
    latitude: number;
    longitude: number;
    distanceMeters: number;
  }>;
  filters: {
    fuel: SelectOption[];
    transmission: SelectOption[];
    bodyType: SelectOption[];
  };
}

export interface SearchItem {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  mileage: number | null;
  location: string | null;
  imageUrl: string | null;
  url: string | null;
}

export interface SearchResponse {
  captured: number;
  matched: number;
  displayed: number;
  outputPath: string;
  items: SearchItem[];
  warning?: string;
  reconciliation:
    | {
        status: 'completed';
        summary: {
          total: number;
          created: number;
          changed: number;
          unchanged: number;
          reactivated: number;
          dryRun: boolean;
        };
      }
    | { status: 'failed'; message: string };
}

export interface ListingRecord {
  id: string;
  externalId: string;
  provider: string;
  title: string;
  description: string | null;
  price: number | string;
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
  publishedAt: string | null;
  sellerType: string | null;
  sellerName: string | null;
  status: string;
  contentHash: string;
  firstSeenAt: string;
  lastSeenAt: string;
  rawPayload: unknown | null;
  classification: VehicleOperabilityClassification | Record<string, unknown> | null;
  classificationVersion: string | null;
  classifiedAt: string | null;
}

export interface VehicleOperabilityClassification {
  status: 'operational' | 'non_operational' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
  evidence: string[];
  reason: string;
}

export interface ListingsResponse {
  count: number;
  items: ListingRecord[];
}
